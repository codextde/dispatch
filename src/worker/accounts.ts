import crypto from "node:crypto"
import type { ImapFlow } from "imapflow"
import postgres from "postgres"
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getDatabaseUrl } from "@/server/env"
import type { Account } from "@/server/db/schema"
import { publish } from "@/server/realtime"
import { decryptCredentials } from "@/server/mail/credentials"
import {
  createImapClient,
  friendlyMailError,
  listMailboxes,
  resolveMailboxPaths,
  type MailboxPaths,
} from "@/server/mail/connection"
import {
  closeAnsweredConversations,
  reconcileServerState,
  syncMailbox,
  type ReconcileState,
  type SyncContext,
} from "@/server/mail/sync"
import { OAuthReauthRequiredError } from "@/server/oauth/tokens"
import type { FolderRole } from "@/server/mail/ingest"
import { createLogger, type Logger } from "./log"

/**
 * One long-lived IMAP connection per active account:
 *   connect → sync INBOX / Sent / Junk → IDLE on INBOX (new mail wakes us)
 *   → poll every 60s (INBOX safety net, Sent/Junk via STATUS, two-way sync)
 * Errors close the connection and it reconnects with exponential backoff
 * (5s … 5min; authentication failures wait 15min to avoid provider lockouts).
 */

const POLL_MS = 60_000
const BASE_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000
const AUTH_BACKOFF_MS = 15 * 60_000
const HEALTHY_AFTER_MS = 60_000
const INBOX_DEBOUNCE_MS = 750

class Semaphore {
  private waiting: (() => void)[] = []
  private active = 0
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

class AccountInactiveError extends Error {}

function isAuthError(err: unknown) {
  const e = err as { authenticationFailed?: boolean; serverResponseCode?: string }
  return err instanceof OAuthReauthRequiredError || Boolean(e?.authenticationFailed) || e?.serverResponseCode === "AUTHENTICATIONFAILED"
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms).unref())])
}

/** Hash of the settings that require a reconnect when changed (not tokens, not status). */
export function connectionFingerprint(a: Account): string {
  const creds = decryptCredentials(a.credentialsEnc)
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        provider: a.provider,
        email: a.email,
        config: a.config,
        imap: creds.imap ? { h: creds.imap.host, p: creds.imap.port, s: creds.imap.secure, u: creds.imap.user, pw: creds.imap.pass } : null,
        oauth: creds.oauth?.provider ?? null,
        syncFrom: a.syncFromDate?.toISOString() ?? null,
      })
    )
    .digest("hex")
}

export class AccountSync {
  state: "starting" | "connected" | "error" | "stopped" = "starting"
  lastError: string | null = null
  private client: ImapFlow | null = null
  private paths: MailboxPaths | null = null
  private account: Account | null = null
  private stopped = false
  private chain: Promise<unknown> = Promise.resolve()
  private wake: (() => void) | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private inboxTimer: NodeJS.Timeout | null = null
  private sessionError: unknown = null
  private failures = new Map<string, number>()
  private reconcile: ReconcileState | null = null
  private backoff = BASE_BACKOFF_MS
  private forceTokenRefresh = false
  private pending = 0
  private runPromise: Promise<void> | null = null
  private readonly log: Logger

  constructor(
    readonly accountId: string,
    private readonly heavy: Semaphore,
    parentLog: Logger
  ) {
    this.log = parentLog.child("sync", { account: accountId.slice(0, 8) })
  }

  start() {
    this.runPromise ??= this.run()
  }

  async stop() {
    this.stopped = true
    this.state = "stopped"
    this.clearTimers()
    this.wake?.()
    const client = this.client
    if (client) {
      await withTimeout(client.logout().catch(() => {}), 5_000)
      client.close()
    }
    await withTimeout(this.runPromise ?? Promise.resolve(), 15_000)
  }

  /** Force a sync pass now (or a reconnect when the connection is down). */
  poke() {
    if (this.client?.usable) void this.enqueue(() => this.pollPass()).catch((err) => this.fail(err))
    else this.wake?.()
  }

  /**
   * Save a sent message to the Sent folder over the live connection — only
   * when it is idle, so a long import never delays it (callers fall back to a
   * short-lived connection when this returns null).
   */
  async appendToSent(raw: Buffer): Promise<{ mailbox: string; uid: number | null } | null> {
    if (this.client?.usable && this.paths && this.pending === 0) {
      const client = this.client
      const sent = this.paths.sent
      if (!sent) return null
      return this.enqueue(async () => {
        const res = await client.append(sent, raw, ["\\Seen"], new Date())
        return { mailbox: sent, uid: res && res.uid ? res.uid : null }
      })
    }
    return null
  }

  private clearTimers() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.inboxTimer) clearTimeout(this.inboxTimer)
    this.pollTimer = null
    this.inboxTimer = null
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++
    const p = this.chain
      .then(() => {
        if (this.stopped || !this.client?.usable) throw new Error("Connection not available")
        return fn()
      })
      .finally(() => {
        this.pending--
      })
    this.chain = p.catch(() => {})
    return p
  }

  /**
   * A background pass failed. A dead connection is re-established by the run
   * loop; anything else (database/storage outage, a bug) keeps the session and
   * is retried by the next poll — the cursor did not move, so nothing is lost.
   */
  private fail(err: unknown) {
    if (this.stopped) return
    if (this.client?.usable) {
      const message = friendlyMailError(err, { kind: "imap" })
      this.log.warn("sync pass failed, retrying on next poll", { error: message })
      if (this.lastError !== message) {
        this.lastError = message
        void this.setStatus("error", message).catch(() => {})
      }
      return
    }
    this.sessionError ??= err
    this.client?.close()
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms)
      t.unref()
      function done() {
        clearTimeout(t)
        resolve()
      }
      this.wake = done
    }).finally(() => {
      this.wake = null
    })
  }

  private async run() {
    while (!this.stopped) {
      const startedAt = Date.now()
      let wait = this.backoff
      try {
        await this.session()
        if (this.stopped) break
        this.log.info("connection closed, reconnecting")
        wait = Date.now() - startedAt > HEALTHY_AFTER_MS ? BASE_BACKOFF_MS : this.backoff
      } catch (err) {
        if (this.stopped) break
        if (err instanceof AccountInactiveError) {
          this.log.info("account inactive, stopping sync")
          break
        }
        const creds = decryptCredentials(this.account?.credentialsEnc)
        const message = friendlyMailError(err, {
          kind: "imap",
          host: creds.imap?.host,
          port: creds.imap?.port,
          oauth: Boolean(creds.oauth),
        })
        const auth = isAuthError(err)
        if (auth && creds.oauth && !this.forceTokenRefresh && !(err instanceof OAuthReauthRequiredError)) {
          // The token may have been revoked before its expiry: refresh once and retry soon
          this.forceTokenRefresh = true
          wait = BASE_BACKOFF_MS
        } else {
          this.forceTokenRefresh = false
          wait = auth ? AUTH_BACKOFF_MS : this.backoff
        }
        this.state = "error"
        this.lastError = message
        await this.setStatus("error", message).catch(() => {})
        this.log.warn("sync failed", { error: message, retryInSec: Math.round(wait / 1000) })
      } finally {
        this.clearTimers()
        this.client?.close()
        this.client = null
      }
      if (this.stopped) break
      await this.sleep(wait)
      this.backoff = Math.min(Math.max(wait, BASE_BACKOFF_MS) * 2, MAX_BACKOFF_MS)
    }
    this.state = "stopped"
  }

  private async loadAccount(): Promise<Account> {
    const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, this.accountId) })
    if (!account || account.status === "paused" || account.provider === "demo" || !account.credentialsEnc) {
      throw new AccountInactiveError()
    }
    return account
  }

  private async session() {
    this.sessionError = null
    const account = await this.loadAccount()
    this.account = account
    if (account.status === "pending" || account.status === "error") await this.setStatus("syncing", account.lastError)

    const client = await createImapClient(
      account,
      { maxIdleTime: 4 * 60_000, autoIdleDelay: 2_000 },
      { forceTokenRefresh: this.forceTokenRefresh }
    )
    this.client = client
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()))
    client.on("error", (err: Error) => this.log.warn("imap connection error", { error: err.message }))
    client.on("exists", (ev: { path: string; count: number; prevCount: number }) => {
      if (this.paths && ev.path === this.paths.inbox && ev.count > ev.prevCount) this.scheduleInbox()
    })

    await client.connect()
    this.forceTokenRefresh = false
    this.paths = resolveMailboxPaths(account.config, await listMailboxes(client))
    this.log.info("connected", { email: account.email, inbox: this.paths.inbox, sent: this.paths.sent, junk: this.paths.junk })
    this.reconcile ??= {
      readWatermark: account.lastSyncedAt ?? new Date(),
      archiveWatermark: account.lastSyncedAt ?? new Date(),
    }

    await this.heavy.run(() => this.enqueue(() => this.fullPass()))
    this.state = "connected"
    this.lastError = null
    this.backoff = BASE_BACKOFF_MS
    await this.setStatus("active", null)

    this.pollTimer = setInterval(() => {
      void this.enqueue(() => this.pollPass()).catch((err) => this.fail(err))
    }, POLL_MS)
    this.pollTimer.unref()

    await closed
    if (this.sessionError) throw this.sessionError
  }

  private scheduleInbox() {
    if (this.inboxTimer) return
    this.inboxTimer = setTimeout(() => {
      this.inboxTimer = null
      void this.enqueue(() => this.syncFolder("inbox")).catch((err) => this.fail(err))
    }, INBOX_DEBOUNCE_MS)
  }

  private ctx(): SyncContext {
    return { client: this.client!, account: this.account!, log: this.log, failures: this.failures }
  }

  private folderPath(role: FolderRole): string | null {
    const p = this.paths
    if (!p) return null
    if (role === "inbox") return p.inbox
    if (role === "sent") return p.sent && p.sent !== p.inbox ? p.sent : null
    if (role === "junk") return p.junk && p.junk !== p.inbox ? p.junk : null
    return null
  }

  private async syncFolder(role: FolderRole) {
    const path = this.folderPath(role)
    if (!path) return null
    this.account = await this.loadAccount() // pick up team/alias/config edits
    const res = await syncMailbox(this.ctx(), path, role)
    if (res.created) this.log.info("synced", { mailbox: path, mode: res.mode, new: res.created })
    return res
  }

  /** First pass after connecting: all folders, then tidy up an initial import. */
  private async fullPass() {
    let imported = false
    for (const role of ["inbox", "sent", "junk"] as const) {
      const res = await this.syncFolder(role)
      if (res?.mode === "initial") imported = true
    }
    if (imported) {
      await closeAnsweredConversations(this.accountId)
      this.log.info("initial import finished")
      await publish({ orgId: this.account!.orgId, type: "conversation.updated", data: { accountId: this.accountId } })
    }
    await this.selectInbox()
  }

  private async pollPass() {
    await this.syncFolder("inbox")
    for (const role of ["sent", "junk"] as const) {
      const path = this.folderPath(role)
      if (!path) continue
      const status = await this.client!.status(path, { uidNext: true, uidValidity: true }).catch(() => false as const)
      if (!status) continue
      const state = await db.query.mailboxSyncState.findFirst({
        where: and(eq(schema.mailboxSyncState.accountId, this.accountId), eq(schema.mailboxSyncState.mailbox, path)),
      })
      const changed =
        !state ||
        (status.uidValidity !== undefined && Number(status.uidValidity) !== state.uidValidity) ||
        (status.uidNext ?? 0) - 1 > state.lastUid
      if (changed) await this.syncFolder(role)
    }
    if (this.paths && this.reconcile && (this.account!.config.markReadOnServer || this.account!.config.syncArchive)) {
      await reconcileServerState(this.ctx(), this.paths, this.reconcile)
    }
    await this.selectInbox()
    this.lastError = null
    await this.setStatus("active", null)
  }

  /** Keep INBOX selected so IDLE notifies us about new mail. */
  private async selectInbox() {
    if (!this.paths || !this.client) return
    const lock = await this.client.getMailboxLock(this.paths.inbox)
    lock.release()
  }

  private async setStatus(status: Account["status"], lastError: string | null) {
    const prev = this.account
    const now = new Date()
    const statusChanged = !prev || prev.status !== status || prev.lastError !== lastError
    await db
      .update(schema.accounts)
      .set({ status, lastError, ...(status === "active" ? { lastSyncedAt: now } : {}) })
      .where(and(eq(schema.accounts.id, this.accountId), ne(schema.accounts.status, "paused")))
    if (prev) this.account = { ...prev, status, lastError, ...(status === "active" ? { lastSyncedAt: now } : {}) }
    if (statusChanged && prev) {
      await publish({ orgId: prev.orgId, type: "account.updated", data: { accountId: this.accountId, status } })
    }
  }
}

/**
 * Session-level advisory locks (one per account) on a dedicated connection,
 * so several worker replicas never sync the same mailbox twice. If the
 * connection is re-established (new backend pid) all locks are gone and are
 * re-acquired.
 */
class AccountLocks {
  private static readonly CLASS_ID = 727301
  private readonly sql = postgres(getDatabaseUrl(), { max: 1, idle_timeout: 0, connect_timeout: 15, onnotice: () => {} })
  private pid: number | null = null

  /** True when the lock session was replaced since the last call (locks lost). */
  async sessionReset(): Promise<boolean> {
    const [row] = await this.sql<{ pid: number }[]>`select pg_backend_pid() as pid`
    const reset = this.pid !== null && row!.pid !== this.pid
    this.pid = row!.pid
    return reset
  }

  async tryLock(accountId: string): Promise<boolean> {
    const [row] = await this.sql<{ ok: boolean }[]>`select pg_try_advisory_lock(${AccountLocks.CLASS_ID}, hashtext(${accountId})) as ok`
    return Boolean(row?.ok)
  }

  async unlock(accountId: string) {
    await this.sql`select pg_advisory_unlock(${AccountLocks.CLASS_ID}, hashtext(${accountId}))`.catch(() => {})
  }

  async end() {
    await this.sql.end({ timeout: 5 }).catch(() => {})
  }
}

/** Keeps exactly one AccountSync per active account (across all worker replicas). */
export class AccountManager {
  private syncs = new Map<string, { sync: AccountSync; fingerprint: string }>()
  private heavy = new Semaphore(3)
  private locks = new AccountLocks()
  private refreshing: Promise<void> | null = null
  private readonly log = createLogger("accounts")

  /** Reconcile running connections with the database. */
  refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null))
    return this.refreshing
  }

  private async doRefresh() {
    const rows = await db
      .select({ account: schema.accounts })
      .from(schema.accounts)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.accounts.orgId))
      .where(
        and(
          ne(schema.accounts.provider, "demo"),
          ne(schema.accounts.status, "paused"),
          isNotNull(schema.accounts.credentialsEnc),
          isNull(schema.organizations.suspendedAt)
        )
      )
    const wanted = new Map(rows.map((r) => [r.account.id, connectionFingerprint(r.account)]))

    if (await this.locks.sessionReset()) {
      this.log.warn("lock connection was re-established, re-acquiring account locks")
      for (const [id, entry] of this.syncs) {
        if (await this.locks.tryLock(id)) continue
        this.log.warn("account is now synced by another worker", { account: id.slice(0, 8) })
        this.syncs.delete(id)
        await entry.sync.stop()
      }
    }

    for (const [id, entry] of this.syncs) {
      if (!wanted.has(id)) {
        this.syncs.delete(id)
        this.log.info("stopping sync (account removed or paused)", { account: id.slice(0, 8) })
        await entry.sync.stop()
        await this.locks.unlock(id)
      }
    }
    for (const [id, fingerprint] of wanted) {
      const entry = this.syncs.get(id)
      if (entry && entry.fingerprint === fingerprint && entry.sync.state !== "stopped") continue
      if (entry) {
        this.log.info("restarting sync (settings changed)", { account: id.slice(0, 8) })
        await entry.sync.stop()
      } else if (!(await this.locks.tryLock(id))) {
        continue // another worker replica owns this mailbox
      }
      const sync = new AccountSync(id, this.heavy, this.log)
      this.syncs.set(id, { sync, fingerprint })
      sync.start()
    }
  }

  /**
   * Restart request broadcast to every worker replica (NOTIFY dispatch_accounts):
   * the replica owning the account restarts it, the others just re-check.
   */
  async restartIfOwned(accountId: string) {
    if (this.syncs.has(accountId)) await this.restart(accountId)
    else await this.refresh()
  }

  /** Restart the connection of an account (or start/stop it). */
  async restart(accountId: string) {
    const entry = this.syncs.get(accountId)
    if (entry) {
      this.syncs.delete(accountId)
      await entry.sync.stop()
      await this.locks.unlock(accountId)
    }
    await this.refresh()
  }

  async stopAll() {
    const all = [...this.syncs.values()]
    this.syncs.clear()
    await Promise.all(all.map((e) => e.sync.stop()))
    await this.locks.end()
  }

  stats() {
    let active = 0
    let errors = 0
    for (const { sync } of this.syncs.values()) {
      if (sync.state === "connected") active++
      else if (sync.state === "error") errors++
    }
    return { total: this.syncs.size, active, errors }
  }

  /** Append a sent message to the Sent folder, via the live connection or a short-lived one. */
  async appendToSent(account: Account, raw: Buffer): Promise<{ mailbox: string; uid: number | null } | null> {
    const live = this.syncs.get(account.id)?.sync
    if (live) {
      const res = await live.appendToSent(raw).catch(() => null)
      if (res) return res
    }
    const client = await createImapClient(account, { disableAutoIdle: true })
    try {
      await client.connect()
      const paths = resolveMailboxPaths(account.config, await listMailboxes(client))
      if (!paths.sent) return null
      const res = await client.append(paths.sent, raw, ["\\Seen"], new Date())
      return { mailbox: paths.sent, uid: res && res.uid ? res.uid : null }
    } finally {
      await withTimeout(client.logout().catch(() => {}), 5_000)
      client.close()
    }
  }
}
