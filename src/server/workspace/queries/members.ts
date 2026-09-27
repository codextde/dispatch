import "server-only"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { listTeamOptions } from "@/server/workspace/queries/common"
import { canGrantPermissions, canGrantRole, isOwnerCtx } from "@/server/workspace/services/roles"

export type MemberRow = {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  title: string | null
  status: "active" | "suspended"
  roleId: string
  lastSeenAt: Date | null
  joinedAt: Date
  teamIds: string[]
  /** Actor may change role / suspend / remove this member */
  manageable: boolean
  isYou: boolean
}

export type InvitationRow = {
  id: string
  email: string
  roleId: string
  teamIds: string[]
  invitedByName: string | null
  invitedByYou: boolean
  createdAt: Date
  expiresAt: Date
  expired: boolean
  /** Actor may resend / copy / revoke */
  manageable: boolean
}

export type MemberRoleOption = {
  id: string
  key: string | null
  name: string
  color: string | null
  description: string | null
  isSystem: boolean
  /** Actor may assign this role (role change or invite) */
  grantable: boolean
}

export async function loadMembersPage(ctx: OrgContext) {
  const orgId = ctx.org.id
  const [members, teamRows, roles, invitations, teams, emailDelivery] = await Promise.all([
    db
      .select({
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        lastSeenAt: schema.users.lastSeenAt,
        title: schema.memberships.title,
        status: schema.memberships.status,
        roleId: schema.memberships.roleId,
        joinedAt: schema.memberships.createdAt,
        roleKey: schema.roles.key,
        rolePermissions: schema.roles.permissions,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(eq(schema.memberships.orgId, orgId))
      .orderBy(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`),
    db
      .select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(eq(schema.teams.orgId, orgId)),
    db.select().from(schema.roles).where(eq(schema.roles.orgId, orgId)),
    db
      .select({
        id: schema.invitations.id,
        email: schema.invitations.email,
        roleId: schema.invitations.roleId,
        teamIds: schema.invitations.teamIds,
        invitedBy: schema.invitations.invitedBy,
        invitedByName: sql<string | null>`coalesce(${schema.users.name}, ${schema.users.email})`,
        createdAt: schema.invitations.createdAt,
        expiresAt: schema.invitations.expiresAt,
      })
      .from(schema.invitations)
      .leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
      .where(
        and(
          eq(schema.invitations.orgId, orgId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt)
        )
      )
      .orderBy(desc(schema.invitations.createdAt)),
    listTeamOptions(orgId),
    isEmailDeliveryConfigured(),
  ])

  const canManage = ctx.permissions.has("members.manage")
  const canInvite = canManage || ctx.permissions.has("members.invite")
  const teamsByUser = new Map<string, string[]>()
  for (const r of teamRows) {
    if (!teamsByUser.has(r.userId)) teamsByUser.set(r.userId, [])
    teamsByUser.get(r.userId)!.push(r.teamId)
  }
  const roleById = new Map(roles.map((r) => [r.id, r]))

  const memberRows: MemberRow[] = members.map((m) => {
    const isYou = m.userId === ctx.user.id
    const outranked = m.roleKey === "owner" ? !isOwnerCtx(ctx) : !canGrantPermissions(ctx, m.rolePermissions)
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      title: m.title,
      status: m.status,
      roleId: m.roleId,
      lastSeenAt: m.lastSeenAt,
      joinedAt: m.joinedAt,
      teamIds: teamsByUser.get(m.userId) ?? [],
      manageable: canManage && (isYou || !outranked),
      isYou,
    }
  })

  const now = Date.now()
  const invitationRows: InvitationRow[] = invitations.map((i) => {
    const role = roleById.get(i.roleId)
    const own = i.invitedBy === ctx.user.id
    return {
      id: i.id,
      email: i.email,
      roleId: i.roleId,
      teamIds: i.teamIds,
      invitedByName: i.invitedByName,
      invitedByYou: own,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      expired: i.expiresAt.getTime() < now,
      manageable: (canManage || (canInvite && own)) && (!role || canGrantRole(ctx, role)),
    }
  })

  const order: Record<string, number> = { owner: 0, admin: 1, member: 2, guest: 3 }
  const roleOptions: MemberRoleOption[] = roles
    .sort((a, b) => (order[a.key ?? ""] ?? 10) - (order[b.key ?? ""] ?? 10) || a.name.localeCompare(b.name))
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      color: r.color,
      description: r.description,
      isSystem: r.isSystem,
      grantable: canGrantRole(ctx, r),
    }))

  const defaultRoleId =
    ctx.org.settings.defaultRoleId && roleById.has(ctx.org.settings.defaultRoleId)
      ? ctx.org.settings.defaultRoleId
      : (roles.find((r) => r.key === "member")?.id ?? null)

  return {
    members: memberRows,
    invitations: invitationRows,
    roles: roleOptions,
    teams,
    emailDelivery,
    canManage,
    canInvite,
    /** Adding invitees to teams grants team inbox access (see assertCanGrantTeamMembership) */
    canAssignTeams: ctx.permissions.has("teams.manage"),
    defaultRoleId,
  }
}

export type MembersPageData = Awaited<ReturnType<typeof loadMembersPage>>
