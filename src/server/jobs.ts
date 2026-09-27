import "server-only"
import { db, schema, type DbOrTx } from "@/server/db"
import { and, eq, inArray, sql } from "drizzle-orm"
import { encrypt, randomToken } from "@/server/crypto"

/**
 * Background jobs (processed by the worker service, see src/worker).
 *
 * Job types:
 *  - "account.sync"        { accountId }            force an IMAP sync now
 *  - "account.test"        { accountId }
 *  - "rules.run"           { conversationId, messageId, trigger }
 *  - "notify.email"        { notificationId }
 *  - "demo.seed"           { orgId, userId }
 */
export async function enqueueJob(
  type: string,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; maxAttempts?: number; tx?: DbOrTx } = {}
) {
  const [job] = await (opts.tx ?? db)
    .insert(schema.jobs)
    .values({ type, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 })
    .returning({ id: schema.jobs.id })
  // wake up the worker immediately
  await (opts.tx ?? db).execute(sql`select pg_notify('dispatch_jobs', ${type})`).catch(() => {})
  return job!.id
}

/* -------------------------------- Webhooks -------------------------------- */

export const WEBHOOK_EVENTS = [
  "conversation.created",
  "conversation.closed",
  "conversation.reopened",
  "conversation.assigned",
  "conversation.labeled",
  "message.received",
  "message.sent",
  "comment.created",
  "task.created",
  "task.completed",
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** Queue deliveries for all enabled webhooks subscribed to `event`. */
export async function emitWebhook(orgId: string, event: WebhookEvent, data: Record<string, unknown>) {
  try {
    const hooks = await db
      .select({ id: schema.webhooks.id, events: schema.webhooks.events })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.orgId, orgId), eq(schema.webhooks.enabled, true)))
    const targets = hooks.filter((h) => h.events.length === 0 || h.events.includes(event) || h.events.includes("*"))
    if (!targets.length) return
    const payload = { id: `evt_${randomToken(12)}`, event, createdAt: new Date().toISOString(), data }
    await db.insert(schema.webhookDeliveries).values(targets.map((t) => ({ webhookId: t.id, event, payload })))
    await db.execute(sql`select pg_notify('dispatch_jobs', 'webhook')`).catch(() => {})
  } catch (err) {
    console.error("[webhooks] emit failed", err)
  }
}

export function newWebhookSecret() {
  const secret = `whsec_${randomToken(24)}`
  return { secret, secretEnc: encrypt(secret) }
}

export async function cancelJobs(ids: string[]) {
  if (!ids.length) return
  await db.update(schema.jobs).set({ completedAt: new Date(), lastError: "canceled" }).where(inArray(schema.jobs.id, ids))
}
