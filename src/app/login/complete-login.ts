import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { audit } from "@/server/audit"
import { createSession, setSessionCookie } from "@/server/auth/session"
import { safeRedirect } from "@/server/auth/magic-link"
import { resolveHomePath } from "@/server/orgs"
import { getRequestMeta } from "@/server/request"

/**
 * Finish a successful sign-in: create a session for this device, set the
 * cookie, write the `auth.login` audit entry and decide where to go next.
 * Only callable from Server Actions / Route Handlers (sets a cookie).
 */
export async function establishSession(opts: {
  userId: string
  email: string
  method: "code" | "link" | "setup"
  isNewUser?: boolean
  redirectTo?: string | null
}): Promise<string> {
  const meta = await getRequestMeta()
  const { token, session } = await createSession(opts.userId, meta)
  await setSessionCookie(token)
  await audit({
    actorId: opts.userId,
    actorEmail: opts.email,
    action: "auth.login",
    targetType: "session",
    targetId: session.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { method: opts.method, newUser: Boolean(opts.isNewUser), device: session.deviceLabel },
  })
  const explicit = safeRedirect(opts.redirectTo, "")
  // Never bounce back to auth pages after signing in
  if (explicit && !/^\/(login|auth\/verify)(\/|\?|$)/.test(explicit)) return explicit
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, opts.userId) })
  return user ? resolveHomePath(user) : "/"
}
