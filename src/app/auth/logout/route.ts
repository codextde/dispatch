import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { hashToken } from "@/server/crypto"
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session"
import { getAppUrl } from "@/server/env"
import { assertSameOrigin } from "@/server/api"

/** POST /auth/logout — revoke the current device session only. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)))
  const res = NextResponse.redirect(new URL("/login?signed_out=1", getAppUrl()), 303)
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
  return res
}
