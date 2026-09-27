import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { assertSameOrigin } from "@/server/api"
import { audit } from "@/server/audit"
import { createSession, SESSION_COOKIE, sessionCookieOptions, validateSessionToken } from "@/server/auth/session"
import { safeRedirect } from "@/server/auth/magic-link"
import { getAppUrl, isSecureContext } from "@/server/env"
import { resolveHomePath } from "@/server/orgs"
import { ipFromHeaders } from "@/server/request"
import { isUuid } from "@/server/admin/workspaces"

/**
 * Impersonation
 * -------------
 * A super admin can sign in *as* another user to reproduce problems. The
 * admin's own session token is parked in an httpOnly cookie and a separate,
 * short-lived session is created for the target with `impersonatorId` set
 * (the workspace shell shows a banner with "Stop impersonating"). Stopping
 * deletes that session and restores the admin's. Both events are audited.
 */

export const IMPERSONATOR_COOKIE = "dispatch_impersonator"
const IMPERSONATION_MAX_AGE = 12 * 60 * 60

function impersonatorCookieOptions(maxAge = IMPERSONATION_MAX_AGE) {
  return { httpOnly: true, secure: isSecureContext(), sameSite: "lax" as const, path: "/", maxAge }
}

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, getAppUrl()), 303)
}

function clearCookies(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
  res.cookies.set(IMPERSONATOR_COOKIE, "", impersonatorCookieOptions(0))
  return res
}

function requestMeta(req: NextRequest) {
  return { ip: ipFromHeaders(req.headers), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null }
}

async function readNext(req: NextRequest): Promise<string | null> {
  const type = req.headers.get("content-type") ?? ""
  if (!type.includes("form")) return null
  try {
    const value = (await req.formData()).get("next")
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}

/** POST /admin/impersonate/[userId] */
export async function startImpersonation(req: NextRequest, targetId: string): Promise<Response> {
  try {
    assertSameOrigin(req)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const adminToken = req.cookies.get(SESSION_COOKIE)?.value
  const admin = await validateSessionToken(adminToken)
  if (!admin || !adminToken) return redirectTo(`/login?next=${encodeURIComponent(`/admin/users/${targetId}`)}`)
  if (!admin.user.isSuperAdmin || admin.session.impersonatorId) {
    // An impersonation session can't start another one; non admins learn nothing.
    return new NextResponse("Not found", { status: 404 })
  }
  if (!isUuid(targetId)) return new NextResponse("Not found", { status: 404 })

  const back = (error: string) => redirectTo(`/admin/users/${targetId}?impersonate_error=${error}`)
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, targetId) })
  if (!target) return redirectTo("/admin/users")
  if (target.id === admin.user.id) return back("self")
  if (target.status !== "active") return back("disabled")
  if (target.isSuperAdmin) return back("super_admin")

  const next = await readNext(req)
  const meta = requestMeta(req)
  const { token, session } = await createSession(target.id, { ...meta, impersonatorId: admin.user.id })
  // Impersonation sessions are short-lived (the sliding refresh may extend an active one).
  await db
    .update(schema.sessions)
    .set({ expiresAt: new Date(Date.now() + IMPERSONATION_MAX_AGE * 1000), deviceLabel: `Impersonated by ${admin.user.email}` })
    .where(eq(schema.sessions.id, session.id))

  await audit({
    actorId: admin.user.id,
    actorEmail: admin.user.email,
    action: "admin.impersonation_started",
    targetType: "user",
    targetId: target.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { targetEmail: target.email, sessionId: session.id },
  })

  const destination = safeRedirect(next, "") || (await resolveHomePath(target))
  const res = redirectTo(destination)
  res.cookies.set(IMPERSONATOR_COOKIE, adminToken, impersonatorCookieOptions())
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}

/** POST /admin/impersonate/stop */
export async function stopImpersonation(req: NextRequest): Promise<Response> {
  try {
    assertSameOrigin(req)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const meta = requestMeta(req)
  const current = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  const adminToken = req.cookies.get(IMPERSONATOR_COOKIE)?.value
  const admin = await validateSessionToken(adminToken)
  const adminOk = Boolean(admin && adminToken && admin.user.isSuperAdmin && !admin.session.impersonatorId)

  if (!current?.session.impersonatorId) {
    // Not (or no longer) impersonating: restore a valid parked admin session, else just tidy up.
    if (adminOk && current && current.user.id === admin!.user.id) {
      const res = redirectTo("/admin/users")
      res.cookies.set(SESSION_COOKIE, adminToken!, sessionCookieOptions())
      res.cookies.set(IMPERSONATOR_COOKIE, "", impersonatorCookieOptions(0))
      return res
    }
    const res = redirectTo(current ? "/" : "/login")
    res.cookies.set(IMPERSONATOR_COOKIE, "", impersonatorCookieOptions(0))
    return res
  }

  await db.delete(schema.sessions).where(eq(schema.sessions.id, current.session.id))
  await audit({
    actorId: current.session.impersonatorId,
    actorEmail: admin?.user.email ?? null,
    action: "admin.impersonation_stopped",
    targetType: "user",
    targetId: current.user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { targetEmail: current.user.email, sessionId: current.session.id, restored: adminOk && admin!.user.id === current.session.impersonatorId },
  })

  if (!adminOk || admin!.user.id !== current.session.impersonatorId) {
    return clearCookies(redirectTo("/login"))
  }
  const res = redirectTo(`/admin/users/${current.user.id}`)
  res.cookies.set(SESSION_COOKIE, adminToken!, sessionCookieOptions())
  res.cookies.set(IMPERSONATOR_COOKIE, "", impersonatorCookieOptions(0))
  return res
}
