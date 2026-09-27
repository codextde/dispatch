"use server"

import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { action } from "@/server/action"
import { ApiError } from "@/server/api"
import { audit } from "@/server/audit"
import { assertPermission, assertWritable, requireOrg, requireUser } from "@/server/authz"
import { acceptInvitation } from "@/server/orgs"
import { rateLimit } from "@/server/rate-limit"
import { getRequestMeta } from "@/server/request"
import { isSetupComplete } from "@/server/settings"
import { inviteMembers } from "@/server/workspace/services/members"
import { canCreateWorkspace, checkSlugAvailability, createWorkspaceFor, loadDemoData } from "@/server/setup"

export const checkSlugAction = action(z.object({ slug: z.string().max(80) }), async ({ slug }) => {
  const s = await requireUser()
  const limit = await rateLimit(`slug-check:${s.user.id}`, 300, 3600)
  if (!limit.ok) throw new ApiError(429, "Too many requests. Please slow down.")
  return checkSlugAvailability(slug)
})

/** Create a workspace owned by the current user (respects `auth.workspaceCreation`). */
export const createWorkspaceAction = action(
  z.object({
    name: z.string().trim().min(1, "Name your workspace").max(80),
    slug: z.string().trim().max(60).optional(),
    yourName: z.string().trim().max(80).optional(),
  }),
  async ({ name, slug, yourName }) => {
    const s = await requireUser()
    if (!(await isSetupComplete())) throw new ApiError(409, "Finish the instance setup first.")
    if (!(await canCreateWorkspace(s.user))) {
      throw new ApiError(403, "Only instance administrators can create workspaces. Ask your administrator for an invitation.")
    }
    const limit = await rateLimit(`workspace:create:${s.user.id}`, 10, 3600)
    if (!limit.ok) throw new ApiError(429, "You've created a lot of workspaces recently. Please try again later.")

    if (yourName && !s.user.name) {
      await db.update(schema.users).set({ name: yourName }).where(eq(schema.users.id, s.user.id))
    }
    const org = await createWorkspaceFor({ userId: s.user.id, name, slug })
    return { slug: org.slug, name: org.name }
  }
)

export type InviteResult = {
  email: string
  status: "invited" | "skipped"
  delivered?: boolean
  /** Only returned when the email could not be delivered, so it can be shared manually */
  url?: string
  reason?: string
}

/**
 * Onboarding "invite your team" step: invites with the workspace's default
 * role through the regular members service (role-grant checks, domain rules,
 * duplicate handling). Only available while the workspace is being onboarded.
 */
export const inviteTeammatesAction = action(
  z.object({
    slug: z.string().min(1).max(60),
    emails: z.array(z.string().max(320)).min(1, "Add at least one email address").max(50, "Invite up to 50 people at once"),
  }),
  async ({ slug, emails }): Promise<InviteResult[]> => {
    const ctx = await requireOrg(slug)
    assertPermission(ctx, "members.invite")
    assertPermission(ctx, "settings.manage")
    assertWritable(ctx)
    if (ctx.org.onboardingCompletedAt) throw new ApiError(409, "Invite teammates from Settings → Members.")
    const limit = await rateLimit(`invite:org:${ctx.org.id}`, 200, 86_400)
    if (!limit.ok) throw new ApiError(429, "Too many invitations today. Please try again tomorrow.")

    const role =
      (ctx.org.settings.defaultRoleId &&
        (await db.query.roles.findFirst({
          where: and(eq(schema.roles.id, ctx.org.settings.defaultRoleId), eq(schema.roles.orgId, ctx.org.id)),
        }))) ||
      (await db.query.roles.findFirst({ where: and(eq(schema.roles.orgId, ctx.org.id), eq(schema.roles.key, "member")) }))
    if (!role) throw new ApiError(500, "This workspace has no member role.")

    const res = await inviteMembers(ctx, { emails, roleId: role.id, teamIds: [] })
    const meta = await getRequestMeta()
    for (const inv of res.invited) {
      await audit({
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        actorEmail: ctx.user.email,
        action: "member.invited",
        targetType: "invitation",
        targetId: inv.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { email: inv.email, roleId: role.id, delivered: inv.delivered, via: "onboarding" },
      })
    }
    return [
      ...res.invited.map((i) => ({
        email: i.email,
        status: "invited" as const,
        delivered: i.delivered,
        url: i.delivered ? undefined : i.url,
      })),
      ...res.skipped.map((sk) => ({ email: sk.email, status: "skipped" as const, reason: sk.reason })),
    ]
  }
)

/** Last onboarding step: mark the workspace as onboarded, optionally loading demo data. */
export const finishOnboardingAction = action(
  z.object({ slug: z.string().min(1).max(60), demo: z.boolean() }),
  async ({ slug, demo }) => {
    const ctx = await requireOrg(slug)
    assertPermission(ctx, "settings.manage")
    if (!ctx.org.onboardingCompletedAt) {
      await db
        .update(schema.organizations)
        .set({ onboardingCompletedAt: new Date() })
        .where(eq(schema.organizations.id, ctx.org.id))
    }
    const res = demo ? await loadDemoData(ctx.org.id, ctx.user.id) : null
    return { demoError: res && !res.ok ? res.error : null }
  }
)

/** Accept one of the current user's pending invitations (from the onboarding "waiting" screen). */
export const acceptPendingInvitationAction = action(z.object({ invitationId: z.uuid() }), async ({ invitationId }) => {
  const s = await requireUser()
  const inv = await db.query.invitations.findFirst({
    where: and(
      eq(schema.invitations.id, invitationId),
      sql`lower(${schema.invitations.email}) = ${s.user.email.toLowerCase()}`,
      isNull(schema.invitations.acceptedAt),
      isNull(schema.invitations.revokedAt),
      gt(schema.invitations.expiresAt, new Date())
    ),
  })
  if (!inv) throw new ApiError(404, "This invitation is no longer valid.")
  await acceptInvitation(inv, s.user.id)
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, inv.orgId), columns: { slug: true } })
  return { path: `/w/${org!.slug}/inbox` }
})
