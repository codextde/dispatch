import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { and, eq, gt, lt, sql, desc, ne, inArray } from "drizzle-orm"
import { UAParser } from "ua-parser-js"
import { db, schema } from "@/server/db"
import { hashToken, randomToken } from "@/server/crypto"
import { isSecureContext } from "@/server/env"
import { getSettings } from "@/server/settings"

/**
 * Sessions
 * --------
 * - Opaque random token in an httpOnly cookie; only its SHA-256 is stored.
 * - One row per device, so users can be signed in on many devices at once
 *   and revoke any of them from Settings → Security.
 * - Valid for `auth.sessionDays` (default 365) and refreshed while in use.
 */

export const SESSION_COOKIE = "dispatch_session"
/** Browsers cap cookie lifetime at 400 days; the DB expiry is authoritative. */
export const COOKIE_MAX_AGE = 400 * 24 * 60 * 60

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  }
}

function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device"
  const r = new UAParser(userAgent).getResult()
  const browser = r.browser.name ?? "Browser"
  const os = r.os.name ? `${r.os.name}${r.os.version ? " " + r.os.version.split(".")[0] : ""}` : ""
  const kind = r.device.type === "mobile" ? "Phone" : r.device.type === "tablet" ? "Tablet" : ""
  return [browser, os && `on ${os}`, kind && `(${kind})`].filter(Boolean).join(" ")
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null; impersonatorId?: string | null } = {}
) {
  const auth = await getSettings("auth")
  const security = await getSettings("security")
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + auth.sessionDays * 86_400_000)
  const [session] = await db
    .insert(schema.sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      deviceLabel: describeDevice(meta.userAgent),
      impersonatorId: meta.impersonatorId ?? null,
      expiresAt,
    })
    .returning()

  // Enforce max sessions per user (drop the oldest ones)
  const all = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.lastUsedAt))
  if (all.length > security.maxSessionsPerUser) {
    const drop = all.slice(security.maxSessionsPerUser).map((s) => s.id)
    await db.delete(schema.sessions).where(inArray(schema.sessions.id, drop))
  }
  return { token, session: session! }
}

/** Set the session cookie (only callable from Server Actions / Route Handlers). */
export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, sessionCookieOptions())
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
}

export type SessionUser = typeof schema.users.$inferSelect
export type CurrentSession = {
  session: typeof schema.sessions.$inferSelect
  user: SessionUser
}

/** Validate a raw session token. Also used by API routes and SSE. */
export async function validateSessionToken(token: string | undefined | null): Promise<CurrentSession | null> {
  if (!token || token.length < 20 || token.length > 200) return null
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1)
  const row = rows[0]
  if (!row || row.user.status !== "active") return null

  // Refresh at most every 10 minutes: last-used + sliding expiry
  const now = Date.now()
  if (now - row.session.lastUsedAt.getTime() > 10 * 60_000) {
    const auth = await getSettings("auth")
    const expiresAt = new Date(now + auth.sessionDays * 86_400_000)
    await db
      .update(schema.sessions)
      .set({ lastUsedAt: new Date(now), expiresAt })
      .where(eq(schema.sessions.id, row.session.id))
    await db.update(schema.users).set({ lastSeenAt: new Date(now) }).where(eq(schema.users.id, row.user.id))
  }
  return row
}

/** Current session for this request (memoized per request). */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const jar = await cookies()
  return validateSessionToken(jar.get(SESSION_COOKIE)?.value)
})

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null
}

export async function revokeSession(sessionId: string, userId: string) {
  await db.delete(schema.sessions).where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)))
}

export async function revokeOtherSessions(currentSessionId: string, userId: string) {
  await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, currentSessionId)))
}

export async function revokeAllSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId))
}

export async function listSessions(userId: string) {
  return db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.lastUsedAt))
}

export async function cleanupExpiredSessions() {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()))
  await db.delete(schema.loginTokens).where(lt(schema.loginTokens.expiresAt, sql`now() - interval '1 day'`))
}
