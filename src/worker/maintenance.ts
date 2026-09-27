import os from "node:os"
import { and, inArray, isNotNull, lte, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { publish } from "@/server/realtime"
import { notify } from "@/server/notifications"
import { cleanupRateLimits } from "@/server/rate-limit"
import { recoverStuckSends } from "@/server/mail/send"
import { createLogger } from "./log"

const log = createLogger("maintenance")

/** Wake snoozed conversations whose time is up. */
export async function wakeSnoozedConversations(): Promise<number> {
  const c = schema.conversations
  const due = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: c.id, orgId: c.orgId, subject: c.subject, customSubject: c.customSubject, snoozedBy: c.snoozedBy })
      .from(c)
      .where(and(isNotNull(c.snoozedUntil), lte(c.snoozedUntil, sql`now()`)))
      .limit(200)
      .for("update", { skipLocked: true })
    if (!rows.length) return rows
    await tx
      .update(c)
      .set({ snoozedUntil: null, snoozedBy: null, status: "open", closedAt: null, closedBy: null, lastActivityAt: new Date() })
      .where(inArray(c.id, rows.map((r) => r.id)))
    await tx.insert(schema.conversationEvents).values(
      rows.map((r) => ({ orgId: r.orgId, conversationId: r.id, actorId: null, type: "unsnoozed", data: { reason: "timer" } }))
    )
    return rows
  })

  for (const r of due) {
    if (r.snoozedBy) {
      await notify({
        orgId: r.orgId,
        userIds: [r.snoozedBy],
        type: "reminder",
        title: `Snooze ended: ${r.customSubject || r.subject || "(no subject)"}`,
        conversationId: r.id,
      }).catch((err) => log.warn("snooze notification failed", { error: err }))
    }
    await publish({ orgId: r.orgId, type: "conversation.updated", conversationId: r.id })
  }
  if (due.length) log.info("woke snoozed conversations", { count: due.length })
  return due.length
}

/** Hourly housekeeping. */
export async function cleanup() {
  // Same as cleanupExpiredSessions() in auth/session.ts (not imported: it pulls in next/headers)
  await db.execute(sql`delete from sessions where expires_at < now()`)
  await db.execute(sql`delete from login_tokens where expires_at < now() - interval '1 day'`)
  await cleanupRateLimits()
  await db.execute(sql`delete from jobs where completed_at is not null and completed_at < now() - interval '7 days'`)
  await db.execute(sql`delete from jobs where completed_at is null and attempts >= max_attempts and created_at < now() - interval '30 days'`)
  await db.execute(sql`delete from webhook_deliveries where created_at < now() - interval '30 days'`)
  const stuck = await recoverStuckSends()
  if (stuck) log.warn("marked interrupted sends as failed", { count: stuck })
}

export type Heartbeat = {
  startedAt: Date
  version: string
  stats: () => { active: number; errors: number; total: number }
  lastError: () => string | null
}

/** Worker status for Admin → System (instance_settings["worker_status"]). */
export async function writeHeartbeat(h: Heartbeat) {
  const s = h.stats()
  const value = {
    heartbeatAt: new Date().toISOString(),
    startedAt: h.startedAt.toISOString(),
    version: h.version,
    activeAccounts: s.active,
    errorAccounts: s.errors,
    totalAccounts: s.total,
    lastError: h.lastError(),
    host: os.hostname(),
    pid: process.pid,
    node: process.version,
  }
  await db
    .insert(schema.instanceSettings)
    .values({ key: "worker_status", value })
    .onConflictDoUpdate({ target: schema.instanceSettings.key, set: { value, updatedAt: new Date() } })
}
