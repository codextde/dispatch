import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getAppUrl } from "@/server/env"
import { sendNotificationEmail } from "@/server/mail/system-mailer"
import { runRules } from "@/server/rules/engine"
import { seedDemoData } from "@/server/demo"
import { escapeHtml } from "@/lib/inbox/templates"
import { deliverRuleWebhook } from "./webhooks"
import { createLogger } from "./log"

/**
 * Generic background jobs (`jobs` table, see src/server/jobs.ts).
 * Claimed with FOR UPDATE SKIP LOCKED, retried with exponential backoff up to
 * `maxAttempts`. Jobs that exhausted their attempts stay in the table with
 * `completed_at is null` (shown as failed in Admin → System).
 */

const log = createLogger("jobs")
const LOCK_TIMEOUT_MS = 15 * 60_000
const CONCURRENCY = 5

type Job = typeof schema.jobs.$inferSelect
export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>

export class PermanentJobError extends Error {}

async function claim(limit: number): Promise<Job[]> {
  const j = schema.jobs
  const due = db
    .select({ id: j.id })
    .from(j)
    .where(
      and(
        isNull(j.completedAt),
        lte(j.runAt, sql`now()`),
        lt(j.attempts, j.maxAttempts),
        or(isNull(j.lockedAt), lt(j.lockedAt, new Date(Date.now() - LOCK_TIMEOUT_MS)))
      )
    )
    .orderBy(j.runAt)
    .limit(limit)
    .for("update", { skipLocked: true })
  return db
    .update(j)
    .set({ lockedAt: new Date(), attempts: sql`${j.attempts} + 1` })
    .where(inArray(j.id, due))
    .returning()
}

function backoffMs(attempts: number) {
  return Math.min(30_000 * 2 ** Math.max(attempts - 1, 0), 3600_000)
}

async function runOne(job: Job, handlers: Record<string, JobHandler>) {
  const j = schema.jobs
  const handler = handlers[job.type]
  if (!handler) {
    log.warn("no handler for job type", { type: job.type, id: job.id })
    await db
      .update(j)
      .set({ lockedAt: null, attempts: job.maxAttempts, lastError: `Unknown job type "${job.type}"` })
      .where(eq(j.id, job.id))
    return
  }
  const started = Date.now()
  try {
    await handler(job.payload ?? {}, job)
    await db.update(j).set({ completedAt: new Date(), lockedAt: null, lastError: null }).where(eq(j.id, job.id))
    log.debug("job done", { type: job.type, ms: Date.now() - started })
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000)
    const permanent = err instanceof PermanentJobError
    await db
      .update(j)
      .set({
        lockedAt: null,
        lastError: message,
        ...(permanent ? { attempts: job.maxAttempts } : { runAt: new Date(Date.now() + backoffMs(job.attempts)) }),
      })
      .where(eq(j.id, job.id))
    const exhausted = permanent || job.attempts >= job.maxAttempts
    log[exhausted ? "error" : "warn"](exhausted ? "job failed permanently" : "job failed, will retry", {
      type: job.type,
      id: job.id,
      attempt: job.attempts,
      error: message,
    })
  }
}

export async function processJobs(handlers: Record<string, JobHandler>, shouldStop: () => boolean): Promise<number> {
  let processed = 0
  while (!shouldStop()) {
    const batch = await claim(10)
    if (!batch.length) break
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map((job) => runOne(job, handlers)))
    }
    processed += batch.length
    if (batch.length < 10) break
  }
  return processed
}

/* --------------------------------- Handlers -------------------------------- */

const str = (v: unknown) => (typeof v === "string" && v ? v : null)

/** "notify.email": email a notification if it is still unread. */
export async function handleNotifyEmail(payload: Record<string, unknown>) {
  const id = str(payload.notificationId)
  if (!id) throw new PermanentJobError("Missing notificationId")
  const n = await db.query.notifications.findFirst({ where: eq(schema.notifications.id, id) })
  if (!n || n.readAt) return
  const [row] = await db
    .select({ user: schema.users, org: schema.organizations, status: schema.memberships.status })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, n.userId), eq(schema.memberships.orgId, n.orgId)))
    .limit(1)
  if (!row || row.status !== "active" || row.user.status !== "active") return
  if (row.user.preferences?.notifications?.email === false) return

  const base = `${getAppUrl()}/w/${row.org.slug}`
  const url = n.conversationId ? `${base}/all/${n.conversationId}` : `${base}/inbox`
  const body = n.body?.trim() || ""
  await sendNotificationEmail({
    to: row.user.email,
    subject: n.title,
    heading: n.title,
    bodyHtml: body ? `<p style="margin:0;white-space:pre-line">${escapeHtml(body)}</p>` : `<p style="margin:0">${escapeHtml(row.org.name)}</p>`,
    bodyText: body || n.title,
    url,
    cta: n.conversationId ? "Open conversation" : undefined,
  })
}

/** "rules.run": run rules for a message (e.g. re-run requested from the UI). */
export async function handleRulesRun(payload: Record<string, unknown>) {
  const messageId = str(payload.messageId)
  if (!messageId) throw new PermanentJobError("Missing messageId")
  const msg = await db.query.messages.findFirst({
    where: eq(schema.messages.id, messageId),
    columns: { orgId: true, conversationId: true, direction: true },
  })
  if (!msg) return
  const trigger = payload.trigger === "outgoing" || payload.trigger === "incoming" ? payload.trigger : msg.direction === "inbound" ? "incoming" : "outgoing"
  await runRules({ orgId: msg.orgId, trigger, conversationId: str(payload.conversationId) ?? msg.conversationId, messageId })
}

export async function handleRuleWebhook(payload: Record<string, unknown>) {
  try {
    await deliverRuleWebhook(payload)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === "EBLOCKEDHOST" || /Unsupported URL|Missing url|Invalid URL/i.test(String((err as Error).message))) {
      throw new PermanentJobError((err as Error).message)
    }
    throw err
  }
}

export async function handleDemoSeed(payload: Record<string, unknown>) {
  const orgId = str(payload.orgId)
  const userId = str(payload.userId)
  if (!orgId || !userId) throw new PermanentJobError("Missing orgId/userId")
  await seedDemoData(orgId, userId)
}
