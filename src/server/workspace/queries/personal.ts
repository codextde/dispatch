import "server-only"
import { and, desc, eq, like, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { UAParser } from "ua-parser-js"
import { listSessions } from "@/server/auth/session"

export type DeviceRow = {
  id: string
  deviceLabel: string
  ip: string | null
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
  current: boolean
  impersonated: boolean
}

export async function loadDevices(userId: string, currentSessionId: string): Promise<DeviceRow[]> {
  const rows = await listSessions(userId)
  return rows
    .map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel || "Unknown device",
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      current: s.id === currentSessionId,
      impersonated: Boolean(s.impersonatorId),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
}

export type SignInEvent = {
  id: string
  action: string
  ip: string | null
  device: string | null
  createdAt: Date
  metadata: Record<string, unknown>
}

function describeUserAgent(ua: string | null): string | null {
  if (!ua) return null
  const r = new UAParser(ua).getResult()
  if (!r.browser.name && !r.os.name) return ua.slice(0, 60)
  return [r.browser.name, r.os.name && `on ${r.os.name}`].filter(Boolean).join(" ")
}

/** The user's own recent authentication events (instance-level and workspace-level). */
export async function loadSignInActivity(user: { id: string; email: string }, limit = 15): Promise<SignInEvent[]> {
  const a = schema.auditLogs
  const rows = await db
    .select({ id: a.id, action: a.action, ip: a.ip, userAgent: a.userAgent, createdAt: a.createdAt, metadata: a.metadata })
    .from(a)
    .where(
      and(
        like(a.action, "auth.%"),
        or(eq(a.actorId, user.id), sql`lower(${a.actorEmail}) = ${user.email.toLowerCase()}`)
      )
    )
    .orderBy(desc(a.createdAt))
    .limit(limit)
  return rows.map(({ userAgent, ...r }) => ({ ...r, device: describeUserAgent(userAgent) }))
}
