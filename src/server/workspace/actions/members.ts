"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, revalidateWorkspace, workspaceAction } from "@/server/workspace/context"
import { scheduleStorageCleanup } from "@/server/workspace/storage-cleanup"
import {
  changeMemberRole,
  inviteMembers,
  MAX_INVITES_PER_REQUEST,
  removeMember,
  resendInvitation,
  revokeInvitation,
  setMemberStatus,
} from "@/server/workspace/services/members"

const slug = z.string().min(1).max(64)

export const inviteMembersAction = action(
  z.object({
    slug,
    emails: z.array(z.string().max(320)).min(1, "Add at least one email address").max(MAX_INVITES_PER_REQUEST * 2),
    roleId: z.uuid("Choose a role"),
    teamIds: z.array(z.uuid()).max(100).default([]),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, ["members.invite", "members.manage"])
    const result = await inviteMembers(ctx, input)
    for (const inv of result.invited) {
      await auditAction(ctx, "member.invited", { type: "invitation", id: inv.id }, {
        email: inv.email,
        roleId: input.roleId,
        teamIds: input.teamIds,
        emailed: inv.delivered,
      })
    }
    if (result.invited.length) {
      await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
      revalidateSettings()
    }
    return result
  }
)

export const resendInvitationAction = action(
  z.object({ slug, id: z.uuid(), sendEmail: z.boolean().default(true) }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, ["members.invite", "members.manage"])
    const res = await resendInvitation(ctx, input.id, { sendEmail: input.sendEmail })
    await auditAction(ctx, "invitation.resent", { type: "invitation", id: res.id }, { email: res.email, emailed: res.delivered })
    revalidateSettings()
    return { url: res.url, email: res.email, delivered: res.delivered, emailDelivery: res.emailDelivery }
  }
)

export const revokeInvitationAction = action(z.object({ slug, id: z.uuid() }), async (input) => {
  const ctx = await workspaceAction(input.slug, ["members.invite", "members.manage"])
  const res = await revokeInvitation(ctx, input.id)
  await auditAction(ctx, "invitation.revoked", { type: "invitation", id: res.id }, { email: res.email })
  revalidateSettings()
  return res
})

export const changeMemberRoleAction = action(
  z.object({ slug, userId: z.uuid(), roleId: z.uuid() }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "members.manage")
    const res = await changeMemberRole(ctx, input)
    if (res.changed) {
      await auditAction(ctx, "member.role_changed", { type: "user", id: input.userId }, {
        email: res.email,
        from: { id: res.from.id, name: res.from.name },
        to: { id: res.to.id, name: res.to.name },
      })
      await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
      if (input.userId === ctx.user.id) revalidateWorkspace()
      else revalidateSettings()
    }
    return { changed: res.changed, roleName: res.to.name }
  }
)

export const setMemberStatusAction = action(
  z.object({ slug, userId: z.uuid(), status: z.enum(["active", "suspended"]) }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "members.manage")
    const res = await setMemberStatus(ctx, input)
    if (res.changed) {
      await auditAction(
        ctx,
        input.status === "suspended" ? "member.suspended" : "member.reactivated",
        { type: "user", id: input.userId },
        { email: res.email }
      )
      await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
      revalidateSettings()
    }
    return { changed: res.changed }
  }
)

export const removeMemberAction = action(z.object({ slug, userId: z.uuid() }), async (input) => {
  const ctx = await workspaceAction(input.slug, "members.manage")
  const { storageKeys, ...res } = await removeMember(ctx, input.userId)
  scheduleStorageCleanup(storageKeys)
  await auditAction(ctx, "member.removed", { type: "user", id: input.userId }, res)
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
  if (res.personalInboxes) await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id })
  revalidateSettings()
  return res
})
