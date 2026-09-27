import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { hashToken } from "@/server/crypto"
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session"
import { getAppUrl } from "@/server/env"
import { assertSameOrigin } from "@/server/api"
import { audit } from "@/server/audit"
import { ipFromHeaders } from "@/server/request"

/** POST /auth/logout — revoke the current device session only. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    const [ended] = await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, hashToken(token)))
      .returning({ id: schema.sessions.id, userId: schema.sessions.userId, impersonatorId: schema.sessions.impersonatorId })
    if (ended) {
      await audit({
        actorId: ended.userId,
        action: "auth.logout",
        targetType: "session",
        targetId: ended.id,
        ip: ipFromHeaders(req.headers),
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        metadata: ended.impersonatorId ? { impersonatorId: ended.impersonatorId } : {},
      })
    }
  }
  const res = NextResponse.redirect(new URL("/login?signed_out=1", getAppUrl()), 303)
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
  // A super admin's parked session (see /admin/impersonate) must not survive signing out
  res.cookies.set("dispatch_impersonator", "", { ...sessionCookieOptions(), maxAge: 0 })
  return res
}
