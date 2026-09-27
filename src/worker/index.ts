/**
 * Dispatch worker — background process next to the web app (same image):
 *
 *   node dist/worker.mjs            (production, see scripts/build-worker.mjs)
 *   pnpm dev:worker                 (development)
 *
 * Responsibilities:
 *  - IMAP sync of every active inbox (AccountManager, IDLE + polling)
 *  - delivery of queued / scheduled outbound messages (every 2s)
 *  - background jobs (`jobs` table) and webhook deliveries
 *  - snooze wake-ups, hourly cleanup, heartbeat for Admin → System
 *
 * Loops wake up early on `NOTIFY dispatch_jobs` (sent by enqueueJob,
 * emitWebhook and the inbox when queueing mail). Multiple workers can run
 * side by side: every claim uses FOR UPDATE SKIP LOCKED.
 */
import fs from "node:fs"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { db } from "@/server/db"
import { getDatabaseUrl } from "@/server/env"
import { appendSentCopy, claimDueMessages, deliverMessage, recoverStuckSends } from "@/server/mail/send"
import type { Message } from "@/server/db/schema"
import { AccountManager } from "./accounts"
import { handleDemoSeed, handleNotifyEmail, handleRuleWebhook, handleRulesRun, processJobs, type JobHandler } from "./jobs"
import { processWebhookDeliveries } from "./webhooks"
import { cleanup, wakeSnoozedConversations, writeHeartbeat } from "./maintenance"
import { log } from "./log"

const VERSION = process.env.DISPATCH_VERSION || process.env.npm_package_version || "dev"
const startedAt = new Date()
let stopping = false
let lastError: string | null = null

/* ----------------------------------- Loops ---------------------------------- */

class Loop {
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private again = false
  private stopped = false

  constructor(
    readonly name: string,
    private readonly intervalMs: number,
    private readonly fn: () => Promise<unknown>,
    private readonly initialDelayMs = 0
  ) {}

  start() {
    this.schedule(this.initialDelayMs)
  }

  /** Run as soon as possible (coalesces while a run is in progress). */
  wake() {
    if (this.stopped) return
    if (this.running) {
      this.again = true
      return
    }
    this.schedule(0)
  }

  private schedule(ms: number) {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), ms)
  }

  private async run() {
    this.timer = null
    if (this.stopped || this.running) return
    this.again = false
    this.running = this.fn()
      .then(() => undefined)
      .catch((err: unknown) => {
        lastError = `${this.name}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500)
        log.error("loop failed", { loop: this.name, error: err instanceof Error ? err.message : String(err) })
      })
    await this.running
    this.running = null
    if (!this.stopped) this.schedule(this.again ? 0 : this.intervalMs)
  }

  async stop(timeoutMs: number) {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    if (this.running) await Promise.race([this.running, new Promise((r) => setTimeout(r, timeoutMs))])
  }
}

/* ----------------------------------- Main ----------------------------------- */

async function waitForDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      const rows = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.jobs') is not null as ready`)
      if (rows[0]?.ready) return
      log.warn("database is not migrated yet, waiting", { attempt })
    } catch (err) {
      log.warn("waiting for database", { attempt, error: err instanceof Error ? err.message : String(err) })
    }
    if (stopping) process.exit(0)
    await new Promise((r) => setTimeout(r, Math.min(attempt * 1000, 5000)))
  }
}

async function main() {
  log.info("starting", { version: VERSION, node: process.version, pid: process.pid })
  await waitForDatabase()

  const accounts = new AccountManager()

  const sendLoop = new Loop("send", 2_000, async () => {
    while (!stopping) {
      const claimed = await claimDueMessages(10)
      if (!claimed.length) return
      const byAccount = new Map<string, Message[]>()
      for (const m of claimed) byAccount.set(m.accountId ?? "none", [...(byAccount.get(m.accountId ?? "none") ?? []), m])
      await Promise.all(
        [...byAccount.values()].map(async (list) => {
          for (const m of list) {
            const outcome = await deliverMessage(m)
            log.info("message delivery", { message: m.id.slice(0, 8), outcome, attempt: m.sendAttempts })
          }
        })
      )
    }
  })

  // Only the replica holding an account's lock syncs it: broadcast restarts to all of them
  const broadcastRestart = async (p: Record<string, unknown>) => {
    if (typeof p.accountId !== "string") return accounts.refresh()
    try {
      await db.execute(sql`select pg_notify('dispatch_accounts', ${p.accountId})`)
    } catch {
      await accounts.restartIfOwned(p.accountId)
    }
  }
  const handlers: Record<string, JobHandler> = {
    "account.sync": broadcastRestart,
    "account.test": broadcastRestart,
    "imap.append_sent": async (p) => {
      if (typeof p.messageId === "string") await appendSentCopy(p.messageId, (account, raw) => accounts.appendToSent(account, raw))
    },
    "notify.email": handleNotifyEmail,
    "rules.run": handleRulesRun,
    "rule.webhook": handleRuleWebhook,
    "demo.seed": handleDemoSeed,
  }
  const jobsLoop = new Loop("jobs", 5_000, () => processJobs(handlers, () => stopping))
  const webhookLoop = new Loop("webhooks", 5_000, () => processWebhookDeliveries(() => stopping))
  const snoozeLoop = new Loop("snooze", 30_000, wakeSnoozedConversations)
  const accountsLoop = new Loop("accounts", 30_000, () => accounts.refresh())
  const heartbeat = () =>
    writeHeartbeat({ startedAt, version: VERSION, stats: () => accounts.stats(), lastError: () => lastError })
  const heartbeatLoop = new Loop("heartbeat", 30_000, heartbeat)
  const cleanupLoop = new Loop("cleanup", 3600_000, cleanup, 60_000)
  const loops = [sendLoop, jobsLoop, webhookLoop, snoozeLoop, accountsLoop, heartbeatLoop, cleanupLoop]

  const stuck = await recoverStuckSends().catch(() => 0)
  if (stuck) log.warn("marked interrupted sends as failed", { count: stuck })

  // LISTEN for wake-ups (postgres.js reconnects automatically)
  const listener = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {}, idle_timeout: 0 })
  const onError = (err: unknown) =>
    log.warn("LISTEN failed, relying on polling", { error: err instanceof Error ? err.message : String(err) })
  await listener
    .listen(
      "dispatch_jobs",
      (payload) => {
        if (payload === "message.send" || payload === "send") sendLoop.wake()
        else if (payload === "webhook") webhookLoop.wake()
        else jobsLoop.wake()
      },
      () => log.info("listening for wake-ups", { channel: "dispatch_jobs" })
    )
    .catch(onError)
  await listener
    .listen("dispatch_accounts", (accountId) => {
      if (/^[0-9a-f-]{36}$/i.test(accountId)) {
        void accounts.restartIfOwned(accountId).catch((err: unknown) =>
          log.error("account restart failed", { account: accountId.slice(0, 8), error: err instanceof Error ? err.message : String(err) })
        )
      }
    })
    .catch(onError)

  for (const l of loops) l.start()

  // Liveness file for the container healthcheck: only refreshed while the event loop is alive
  const heartbeatFile = process.env.WORKER_HEARTBEAT_FILE || "/tmp/dispatch-worker.heartbeat"
  const touch = () => void fs.promises.writeFile(heartbeatFile, new Date().toISOString()).catch(() => {})
  touch()
  setInterval(touch, 15_000).unref()
  log.info("worker ready")

  // Docker gives 10s between SIGTERM and SIGKILL by default
  const shutdownBudgetMs = Math.max(Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS) || 9_000, 3_000)
  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    log.info("shutting down", { signal })
    const force = setTimeout(() => {
      log.error("forced exit after shutdown timeout")
      process.exit(1)
    }, shutdownBudgetMs)
    force.unref()
    // Let in-flight deliveries and jobs finish while IMAP connections log out
    await Promise.all([Promise.all(loops.map((l) => l.stop(shutdownBudgetMs - 2_500))), accounts.stopAll()])
    await listener.end({ timeout: 1 }).catch(() => {})
    await db.$client.end({ timeout: 1 }).catch(() => {})
    log.info("stopped")
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

process.on("unhandledRejection", (reason) => {
  lastError = `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`.slice(0, 500)
  log.error("unhandled rejection", { error: reason instanceof Error ? reason.stack ?? reason.message : String(reason) })
})
process.on("uncaughtException", (err) => {
  log.error("uncaught exception", { error: err.stack ?? err.message })
  process.exit(1)
})

main().catch((err) => {
  log.error("worker failed to start", { error: err instanceof Error ? err.stack ?? err.message : String(err) })
  process.exit(1)
})
