import "server-only"
import { db, schema } from "@/server/db"

export type AuditInput = {
  orgId?: string | null
  actorId?: string | null
  actorEmail?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append an entry to the audit log. Never throws — auditing must not break
 * the action being audited.
 *
 * Action naming: "<resource>.<verb>", e.g. "member.role_changed",
 * "inbox.connected", "settings.updated", "auth.login".
 */
export async function audit(entry: AuditInput) {
  try {
    await db.insert(schema.auditLogs).values({
      orgId: entry.orgId ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? {},
    })
  } catch (err) {
    console.error("[audit] failed to write audit log", err)
  }
}
