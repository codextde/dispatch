"use server"

import { redirect, RedirectType } from "next/navigation"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { action } from "@/server/action"
import { ApiError } from "@/server/api"
import { audit } from "@/server/audit"
import { requireUser } from "@/server/authz"
import { clearSessionCookie } from "@/server/auth/session"
import { hashToken } from "@/server/crypto"
import { acceptInvitation } from "@/server/orgs"
import { getRequestMeta } from "@/server/request"
import { PASSWORD_MIN_LENGTH, passwordHash } from "@/server/auth/password"
import { establishSession } from "@/app/login/complete-login"

const tokenSchema = z.object({ token: z.string().min(20).max(200) })
const passwordInviteSchema = tokenSchema.extend({ password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(4000) })

async function findInvitation(token: string) {
  return db.query.invitations.findFirst({ where: eq(schema.invitations.tokenHash, hashToken(token)) })
}

/** Join the workspace (the signed-in user's email must match the invitation). */
export const acceptInviteAction = action(tokenSchema, async ({ token }) => {
  const s = await requireUser()
  const inv = await findInvitation(token)
  if (!inv || inv.revokedAt) throw new ApiError(404, "This invitation is no longer valid.")
  if (inv.email.toLowerCase() !== s.user.email.toLowerCase()) {
    throw new ApiError(403, `This invitation was sent to ${inv.email}. Sign in with that address to accept it.`)
  }
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, inv.orgId) })
  if (!org) throw new ApiError(404, "This workspace no longer exists.")

  const member = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, inv.orgId), eq(schema.memberships.userId, s.user.id)),
  })
  if (!member) {
    // Joining a workspace is the user's decision, not an impersonating admin's
    if (s.session.impersonatorId) throw new ApiError(403, "You can't accept invitations while impersonating this user.")
    if (inv.acceptedAt) throw new ApiError(410, "This invitation has already been used.")
    if (inv.expiresAt < new Date()) throw new ApiError(410, "This invitation has expired. Ask for a new one.")
    await acceptInvitation(inv, s.user.id)
  }
  await db
    .update(schema.users)
    .set({ preferences: { ...s.user.preferences, lastOrgSlug: org.slug } })
    .where(eq(schema.users.id, s.user.id))
  redirect(`/w/${org.slug}/inbox`, RedirectType.replace)
})

/** Create/set a local password directly from a valid invitation, then join and sign in. */
export const setInvitePasswordAction = action(passwordInviteSchema, async ({ token, password }) => {
  const inv = await findInvitation(token)
  if (!inv || inv.revokedAt) throw new ApiError(404, "This invitation is no longer valid.")
  if (inv.acceptedAt) throw new ApiError(410, "This invitation has already been used.")
  if (inv.expiresAt < new Date()) throw new ApiError(410, "This invitation has expired. Ask for a new one.")
  const email = inv.email.toLowerCase()
  let user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` })
  if (!user) {
    const [created] = await db.insert(schema.users).values({ email, name: null, passwordHash: passwordHash(password) }).returning()
    user = created
  } else {
    const [updated] = await db.update(schema.users).set({ passwordHash: passwordHash(password), status: "active" }).where(eq(schema.users.id, user.id)).returning()
    user = updated
  }
  if (!user) throw new ApiError(500, "Could not create the account.")
  await acceptInvitation(inv, user.id)
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, inv.orgId) })
  if (!org) throw new ApiError(404, "This workspace no longer exists.")
  await db.update(schema.users).set({ preferences: { ...user.preferences, lastOrgSlug: org.slug } }).where(eq(schema.users.id, user.id))
  const redirectTo = await establishSession({ userId: user.id, email: user.email, method: "password", redirectTo: `/w/${org.slug}/inbox` })
  redirect(redirectTo, RedirectType.replace)
})

/** Signed in with a different account: sign out this device and continue with the invited email. */
export const switchAccountAction = action(tokenSchema, async ({ token }) => {
  const s = await requireUser()
  const inv = await findInvitation(token)
  const meta = await getRequestMeta()
  await db.delete(schema.sessions).where(eq(schema.sessions.id, s.session.id))
  await clearSessionCookie()
  await audit({
    actorId: s.user.id,
    actorEmail: s.user.email,
    action: "auth.logout",
    targetType: "session",
    targetId: s.session.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { reason: "switch_account_for_invitation" },
  })
  const params = new URLSearchParams({ next: `/invite/${token}` })
  if (inv) params.set("email", inv.email)
  redirect(`/login?${params}`, RedirectType.replace)
})
