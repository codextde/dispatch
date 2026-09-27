import "server-only"
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { hashToken, randomToken } from "@/server/crypto"
import { getAppUrl } from "@/server/env"
import { isEmailDeliveryConfigured, sendInvitationEmail } from "@/server/mail/system-mailer"
import { rateLimit } from "@/server/rate-limit"
import { fail } from "@/server/workspace/context"
import { attachmentKeysForConversations, deleteCommentAttachmentRows } from "@/server/workspace/storage-cleanup"
import { parseEmailList } from "@/components/settings/members/parse-emails"
import { filterOrgIds } from "@/server/workspace/queries/common"
import {
  canGrantPermissions,
  canGrantRole,
  countActiveOwners,
  getOrgRole,
  isOwnerCtx,
  type ServiceCtx,
} from "@/server/workspace/services/roles"
import { assertCanGrantTeamMembership } from "@/server/workspace/services/teams"

export const INVITATION_TTL_DAYS = 14
export const MAX_INVITES_PER_REQUEST = 50
/**
 * Invitation emails per 24 h, so the instance sender can't be used to relay
 * spam: per workspace, per sender (across all their workspaces) and per
 * recipient address (across the instance).
 */
export const INVITE_LIMITS = { perOrg: 200, perUser: 100, perRecipient: 5 } as const
/** Resending one invitation: at most once per 10 minutes, 5 times in total */
export const RESEND_COOLDOWN_SECONDS = 600
export const MAX_RESENDS = 5

export function invitationUrl(token: string) {
  return `${getAppUrl()}/invite/${token}`
}

function inviterName(ctx: ServiceCtx) {
  return ctx.user.name?.trim() || ctx.user.email
}

/** Count `count` invitations against the sender's and the workspace's daily quota. */
async function consumeInviteQuota(ctx: ServiceCtx, count: number) {
  if (count <= 0) return
  // Sender first, so one member hitting their limit doesn't use up the workspace's quota
  const user = await rateLimit(`invite:user:${ctx.user.id}`, INVITE_LIMITS.perUser, 86_400, count)
  const org = user.ok ? await rateLimit(`invite:org:${ctx.org.id}`, INVITE_LIMITS.perOrg, 86_400, count) : null
  if (!org?.ok) fail("Too many invitations today. Please try again tomorrow.", 429)
}

/** Has this address already received a lot of invitations today (from any workspace)? */
async function recipientOverQuota(email: string) {
  return !(await rateLimit(`invite:to:${email.toLowerCase()}`, INVITE_LIMITS.perRecipient, 86_400)).ok
}

async function deliverInvitation(ctx: ServiceCtx, email: string, url: string, deliveryConfigured: boolean) {
  if (!deliveryConfigured) return false
  try {
    const res = await sendInvitationEmail({
      to: email,
      orgName: ctx.org.name,
      inviterName: inviterName(ctx),
      inviterEmail: ctx.user.email,
      url,
    })
    return res.delivered
  } catch (err) {
    console.error("[members] invitation email failed", err)
    return false
  }
}

export type InviteResult = {
  invited: { id: string; email: string; url: string; delivered: boolean }[]
  skipped: { email: string; reason: string }[]
  emailDelivery: boolean
}

export async function inviteMembers(
  ctx: ServiceCtx,
  input: { emails: string[]; roleId: string; teamIds: string[] }
): Promise<InviteResult> {
  const { valid, invalid } = parseEmailList(input.emails)
  if (!valid.length) fail(invalid.length ? `“${invalid[0]}” is not a valid email address` : "Add at least one email address")
  if (valid.length > MAX_INVITES_PER_REQUEST) fail(`You can invite up to ${MAX_INVITES_PER_REQUEST} people at once`)

  const role = await getOrgRole(ctx.org.id, input.roleId)
  if (!canGrantRole(ctx, role)) {
    fail(role.key === "owner" ? "Only owners can invite other owners" : "You can't invite people with more permissions than you have")
  }
  const teamIds = await filterOrgIds("teams", ctx.org.id, input.teamIds)
  await assertCanGrantTeamMembership(ctx, teamIds)

  const skipped: InviteResult["skipped"] = invalid.map((email) => ({ email, reason: "Not a valid email address" }))

  // Domain restriction (workspace security setting)
  const allowed = (ctx.org.settings.allowedDomains ?? []).map((d) => d.toLowerCase().replace(/^@/, ""))
  let candidates = valid
  if (ctx.org.settings.requireDomainForInvites && allowed.length) {
    candidates = valid.filter((e) => {
      const ok = allowed.includes(e.split("@")[1]!)
      if (!ok) skipped.push({ email: e, reason: `Only ${allowed.map((d) => "@" + d).join(", ")} addresses can be invited` })
      return ok
    })
  }

  if (candidates.length) {
    const members = await db
      .select({ email: sql<string>`lower(${schema.users.email})` })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, ctx.org.id), inArray(sql`lower(${schema.users.email})`, candidates)))
    const memberSet = new Set(members.map((m) => m.email))

    const pending = await db
      .select({ email: sql<string>`lower(${schema.invitations.email})` })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.orgId, ctx.org.id),
          inArray(sql`lower(${schema.invitations.email})`, candidates),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          gt(schema.invitations.expiresAt, new Date())
        )
      )
    const pendingSet = new Set(pending.map((p) => p.email))

    candidates = candidates.filter((e) => {
      if (memberSet.has(e)) skipped.push({ email: e, reason: "Already a member" })
      else if (pendingSet.has(e)) skipped.push({ email: e, reason: "Already invited — resend it from the pending list" })
      else return true
      return false
    })
  }

  const deliveryConfigured = await isEmailDeliveryConfigured()
  const invited: InviteResult["invited"] = []
  if (candidates.length) {
    await consumeInviteQuota(ctx, candidates.length)
    const fresh: string[] = []
    for (const email of candidates) {
      if (await recipientOverQuota(email)) skipped.push({ email, reason: "This address received too many invitations today" })
      else fresh.push(email)
    }
    candidates = fresh
  }
  if (candidates.length) {
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000)
    const tokens = candidates.map(() => randomToken())
    const rows = await db
      .insert(schema.invitations)
      .values(
        candidates.map((email, i) => ({
          orgId: ctx.org.id,
          email,
          roleId: role.id,
          teamIds,
          tokenHash: hashToken(tokens[i]!),
          invitedBy: ctx.user.id,
          expiresAt,
        }))
      )
      .returning({ id: schema.invitations.id, email: schema.invitations.email })
    for (let i = 0; i < rows.length; i++) {
      const url = invitationUrl(tokens[i]!)
      const delivered = await deliverInvitation(ctx, rows[i]!.email, url, deliveryConfigured)
      invited.push({ id: rows[i]!.id, email: rows[i]!.email, url, delivered })
    }
  }

  return { invited, skipped, emailDelivery: deliveryConfigured }
}

async function getManageableInvitation(ctx: ServiceCtx, id: string) {
  const inv = await db.query.invitations.findFirst({
    where: and(eq(schema.invitations.id, id), eq(schema.invitations.orgId, ctx.org.id)),
    with: { role: true },
  })
  if (!inv) fail("Invitation not found", 404)
  if (inv.acceptedAt) fail("This invitation was already accepted")
  if (inv.revokedAt) fail("This invitation was revoked")
  const mayManage = ctx.permissions.has("members.manage") || (ctx.permissions.has("members.invite") && inv.invitedBy === ctx.user.id)
  if (!mayManage) fail("You can only manage invitations you sent", 403)
  return inv
}

/**
 * Issue a fresh link for a pending invitation (previous links stop working),
 * extend its expiry and email it again when delivery is configured.
 */
export async function resendInvitation(ctx: ServiceCtx, id: string, opts: { sendEmail?: boolean } = {}) {
  const inv = await getManageableInvitation(ctx, id)
  if (!canGrantRole(ctx, inv.role)) fail("You can't share an invitation for a role with more permissions than you have", 403)
  const deliveryConfigured = await isEmailDeliveryConfigured()
  const sendEmail = opts.sendEmail !== false && deliveryConfigured
  if (sendEmail) {
    const cooldown = await rateLimit(`invite:resend:${inv.id}`, 1, RESEND_COOLDOWN_SECONDS)
    if (!cooldown.ok) fail("This invitation was just sent. Wait a few minutes before sending it again.", 429)
    const total = await rateLimit(`invite:resends:${inv.id}`, MAX_RESENDS, 365 * 86_400)
    if (!total.ok) fail("This invitation has been resent too often. Copy the link and share it directly instead.", 429)
    await consumeInviteQuota(ctx, 1)
    if (await recipientOverQuota(inv.email)) fail("This address received too many invitations today. Copy the link and share it directly instead.", 429)
  }
  const token = randomToken()
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000)
  await db
    .update(schema.invitations)
    .set({ tokenHash: hashToken(token), expiresAt })
    .where(and(eq(schema.invitations.id, inv.id), eq(schema.invitations.orgId, ctx.org.id)))
  const url = invitationUrl(token)
  const delivered = sendEmail ? await deliverInvitation(ctx, inv.email, url, deliveryConfigured) : false
  return { id: inv.id, email: inv.email, url, delivered, expiresAt, emailDelivery: deliveryConfigured }
}

export async function revokeInvitation(ctx: ServiceCtx, id: string) {
  const inv = await getManageableInvitation(ctx, id)
  await db
    .update(schema.invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.invitations.id, inv.id), eq(schema.invitations.orgId, ctx.org.id)))
  return { id: inv.id, email: inv.email }
}

async function getTargetMembership(ctx: ServiceCtx, userId: string) {
  const rows = await db
    .select({ membership: schema.memberships, role: schema.roles, email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, userId)))
    .limit(1)
  const row = rows[0]
  if (!row) fail("Member not found", 404)
  return row
}

/** Non-owners can't act on members who hold permissions they don't have themselves. */
function assertCanActOn(ctx: ServiceCtx, target: { role: { key: string | null; permissions: string[] } }, verb: string) {
  if (target.role.key === "owner" && !isOwnerCtx(ctx)) fail(`Only owners can ${verb} an owner`, 403)
  if (!canGrantPermissions(ctx, target.role.permissions)) {
    fail(`You can't ${verb} someone with more permissions than you have`, 403)
  }
}

export async function changeMemberRole(ctx: ServiceCtx, input: { userId: string; roleId: string }) {
  const target = await getTargetMembership(ctx, input.userId)
  const role = await getOrgRole(ctx.org.id, input.roleId)
  if (target.role.id === role.id) return { changed: false as const, from: target.role, to: role, email: target.email }

  const self = input.userId === ctx.user.id
  if (!self) assertCanActOn(ctx, target, "change the role of")
  if (!canGrantRole(ctx, role)) {
    fail(role.key === "owner" ? "Only owners can make someone an owner" : "You can't assign a role with more permissions than you have", 403)
  }
  if (target.role.key === "owner" && role.key !== "owner") {
    if (!isOwnerCtx(ctx)) fail("Only owners can change an owner's role", 403)
    if ((await countActiveOwners(ctx.org.id, input.userId)) === 0) {
      fail("A workspace needs at least one owner. Make someone else an owner first.")
    }
  }
  await db
    .update(schema.memberships)
    .set({ roleId: role.id })
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, input.userId)))
  return { changed: true as const, from: target.role, to: role, email: target.email }
}

export async function setMemberStatus(ctx: ServiceCtx, input: { userId: string; status: "active" | "suspended" }) {
  if (input.userId === ctx.user.id) fail("You can't change your own status")
  const target = await getTargetMembership(ctx, input.userId)
  if (target.membership.status === input.status) return { changed: false as const, email: target.email }
  assertCanActOn(ctx, target, input.status === "suspended" ? "suspend" : "reactivate")
  if (input.status === "suspended" && target.role.key === "owner" && (await countActiveOwners(ctx.org.id, input.userId)) === 0) {
    fail("You can't suspend the last active owner")
  }
  await db
    .update(schema.memberships)
    .set({ status: input.status })
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, input.userId)))
  return { changed: true as const, email: target.email }
}

/**
 * Remove a member from the workspace together with everything that only
 * made sense while they were a member: team memberships, inbox access,
 * assignments, their personal inboxes (incl. conversations) and personal
 * labels / responses / signatures / rules / API keys in this workspace.
 */
export async function removeMember(ctx: ServiceCtx, userId: string) {
  if (userId === ctx.user.id) fail("You can't remove yourself here — use “Leave workspace” in General settings")
  const target = await getTargetMembership(ctx, userId)
  assertCanActOn(ctx, target, "remove")
  if (target.role.key === "owner" && (await countActiveOwners(ctx.org.id, userId)) === 0) {
    fail("You can't remove the last owner of the workspace")
  }
  const { storageKeys, ...summary } = await purgeMembership(ctx.org.id, userId)

  // storageKeys: attachment files of deleted personal-inbox conversations (see scheduleStorageCleanup)
  return { email: target.email, role: target.role.name, ...summary, storageKeys }
}

/**
 * Delete a membership and everything that only made sense while the user was a
 * member (used by "remove member" and "leave workspace"). Shared conversations
 * are kept. Returns the storage keys of deleted attachments; pass them to
 * scheduleStorageCleanup() once the transaction has committed.
 */
export async function purgeMembership(orgId: string, userId: string) {
  return db.transaction(async (tx) => {
    const orgTeamIds = tx.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.orgId, orgId))
    const orgAccountIds = tx.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.orgId, orgId))
    const orgConversationIds = tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.orgId, orgId))

    const personal = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.orgId, orgId), eq(schema.accounts.ownerUserId, userId)))
    const personalIds = personal.map((p) => p.id)

    await tx.delete(schema.teamMembers).where(and(eq(schema.teamMembers.userId, userId), inArray(schema.teamMembers.teamId, orgTeamIds)))
    await tx
      .delete(schema.accountAccess)
      .where(and(eq(schema.accountAccess.userId, userId), inArray(schema.accountAccess.accountId, orgAccountIds)))
    await tx
      .delete(schema.conversationAssignees)
      .where(and(eq(schema.conversationAssignees.userId, userId), inArray(schema.conversationAssignees.conversationId, orgConversationIds)))

    let deletedConversations = 0
    let storageKeys: string[] = []
    if (personalIds.length) {
      storageKeys = await attachmentKeysForConversations(tx, orgId, { accountIds: personalIds })
      await deleteCommentAttachmentRows(tx, orgId, personalIds)
      const deleted = await tx
        .delete(schema.conversations)
        .where(and(eq(schema.conversations.orgId, orgId), inArray(schema.conversations.accountId, personalIds)))
        .returning({ id: schema.conversations.id })
      deletedConversations = deleted.length
      await tx.delete(schema.accounts).where(and(eq(schema.accounts.orgId, orgId), inArray(schema.accounts.id, personalIds)))
    }

    // Personal workspace data
    await tx.delete(schema.labels).where(and(eq(schema.labels.orgId, orgId), eq(schema.labels.ownerUserId, userId)))
    await tx.delete(schema.cannedResponses).where(and(eq(schema.cannedResponses.orgId, orgId), eq(schema.cannedResponses.ownerUserId, userId)))
    await tx.delete(schema.signatures).where(and(eq(schema.signatures.orgId, orgId), eq(schema.signatures.ownerUserId, userId)))
    await tx.delete(schema.rules).where(and(eq(schema.rules.orgId, orgId), eq(schema.rules.ownerUserId, userId)))
    await tx.delete(schema.notifications).where(and(eq(schema.notifications.orgId, orgId), eq(schema.notifications.userId, userId)))
    await tx
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.orgId, orgId), eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))

    await tx.delete(schema.memberships).where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)))
    return { personalInboxes: personalIds.length, deletedConversations, storageKeys }
  })
}
