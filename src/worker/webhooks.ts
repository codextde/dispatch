import { and, eq, inArray, lte, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { tryDecrypt } from "@/server/crypto"
import { audit } from "@/server/audit"
import { postJson } from "./http"
import { signWebhookPayload } from "./webhook-signature"
import { createLogger } from "./log"

/**
 * Webhook deliveries (rows queued by `emitWebhook`). Retries after 1m, 5m,
 * 30m, 2h and 6h (6 attempts); a webhook is disabled after 50 consecutive
 * failed attempts.
 */

const log = createLogger("webhooks")
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000]
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1
const DISABLE_AFTER_FAILURES = 50
const LEASE_MS = 2 * 60_000
const CONCURRENCY = 5
export const USER_AGENT = "Dispatch-Webhooks/1.0"

type Delivery = typeof schema.webhookDeliveries.$inferSelect

/** Claim due deliveries (lease: push nextAttemptAt forward while in flight). */
async function claim(limit: number): Promise<Delivery[]> {
  const d = schema.webhookDeliveries
  const due = db
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.status, "pending"), lte(d.nextAttemptAt, sql`now()`)))
    .orderBy(d.nextAttemptAt)
    .limit(limit)
    .for("update", { skipLocked: true })
  return db
    .update(d)
    .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
    .where(inArray(d.id, due))
    .returning()
}

export async function processWebhookDeliveries(shouldStop: () => boolean): Promise<number> {
  let processed = 0
  while (!shouldStop()) {
    const batch = await claim(20)
    if (!batch.length) break
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map((delivery) => deliver(delivery)))
    }
    processed += batch.length
    if (batch.length < 20) break
  }
  return processed
}

function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === "EBLOCKEDHOST") return e.message ?? "Blocked host"
  if (e?.code === "ENOTFOUND") return "Host not found"
  if (e?.code === "ECONNREFUSED") return "Connection refused"
  if (e?.code === "ETIMEDOUT") return "Timed out after 10s"
  return (e?.message ?? String(err)).slice(0, 300)
}

async function deliver(delivery: Delivery) {
  const hook = await db.query.webhooks.findFirst({ where: eq(schema.webhooks.id, delivery.webhookId) })
  const d = schema.webhookDeliveries
  if (!hook || !hook.enabled) {
    await db
      .update(d)
      .set({ status: "failed", attempts: delivery.attempts, responseBody: hook ? "Webhook is disabled" : "Webhook was deleted" })
      .where(eq(d.id, delivery.id))
    return
  }
  const secret = tryDecrypt(hook.secretEnc)
  const body = JSON.stringify(delivery.payload)
  const attempts = delivery.attempts + 1

  let status = 0
  let responseBody = ""
  let ok = false
  if (!secret) {
    responseBody = "Webhook secret could not be decrypted"
  } else {
    try {
      const res = await postJson(hook.url, body, {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-Dispatch-Event": delivery.event,
        "X-Dispatch-Delivery": delivery.id,
        "X-Dispatch-Signature": signWebhookPayload(secret, body),
      })
      status = res.status
      responseBody = res.body
      ok = res.status >= 200 && res.status < 300
      if (!ok && res.status >= 300 && res.status < 400) responseBody = `Redirects are not followed (HTTP ${res.status}). ${res.body}`.slice(0, 4096)
    } catch (err) {
      responseBody = describeError(err)
    }
  }

  const now = new Date()
  if (ok) {
    await db
      .update(d)
      .set({ status: "success", attempts, responseStatus: status, responseBody, deliveredAt: now })
      .where(eq(d.id, delivery.id))
    await db
      .update(schema.webhooks)
      .set({ lastStatus: status, lastDeliveredAt: now, failureCount: 0 })
      .where(eq(schema.webhooks.id, hook.id))
    return
  }

  const final = attempts >= MAX_ATTEMPTS
  await db
    .update(d)
    .set({
      status: final ? "failed" : "pending",
      attempts,
      responseStatus: status || null,
      responseBody,
      nextAttemptAt: final ? now : new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]!),
    })
    .where(eq(d.id, delivery.id))
  const [updated] = await db
    .update(schema.webhooks)
    .set({ lastStatus: status, failureCount: sql`${schema.webhooks.failureCount} + 1` })
    .where(eq(schema.webhooks.id, hook.id))
    .returning({ failureCount: schema.webhooks.failureCount, enabled: schema.webhooks.enabled })
  log.warn("delivery failed", { webhook: hook.id.slice(0, 8), event: delivery.event, attempt: attempts, status, error: responseBody.slice(0, 120) })

  if (updated && updated.enabled && updated.failureCount >= DISABLE_AFTER_FAILURES) {
    await db.update(schema.webhooks).set({ enabled: false }).where(eq(schema.webhooks.id, hook.id))
    log.warn("webhook disabled after repeated failures", { webhook: hook.id.slice(0, 8), url: hook.url })
    await audit({
      orgId: hook.orgId,
      action: "webhook.auto_disabled",
      targetType: "webhook",
      targetId: hook.id,
      metadata: { url: hook.url, failures: updated.failureCount },
    })
  }
}

/** POST for the rules engine "webhook" action (job "rule.webhook"). Throws on failure so the job retries. */
export async function deliverRuleWebhook(payload: { url?: unknown; body?: unknown }) {
  if (typeof payload.url !== "string") throw new Error("Missing url")
  const body = JSON.stringify(payload.body ?? {})
  const res = await postJson(payload.url, body, {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-Dispatch-Event": "rule.matched",
  })
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`)
}
