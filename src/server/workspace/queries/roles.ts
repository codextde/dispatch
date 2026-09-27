import "server-only"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { isOwnerCtx } from "@/server/workspace/services/roles"

export type RoleRow = {
  id: string
  key: string | null
  name: string
  description: string | null
  color: string | null
  permissions: string[]
  isSystem: boolean
  memberCount: number
  pendingInvitations: number
  /** A few member avatars for the list */
  sampleMembers: { userId: string; name: string | null; email: string; avatarUrl: string | null }[]
  isDefault: boolean
  isYours: boolean
}

export async function loadRolesPage(ctx: OrgContext) {
  const orgId = ctx.org.id
  const [roles, memberRows, inviteCounts] = await Promise.all([
    db.select().from(schema.roles).where(eq(schema.roles.orgId, orgId)),
    db
      .select({
        roleId: schema.memberships.roleId,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, orgId))
      .orderBy(schema.memberships.createdAt),
    db
      .select({ roleId: schema.invitations.roleId, n: sql<number>`count(*)::int` })
      .from(schema.invitations)
      .where(and(eq(schema.invitations.orgId, orgId), isNull(schema.invitations.acceptedAt), isNull(schema.invitations.revokedAt)))
      .groupBy(schema.invitations.roleId),
  ])

  const membersByRole = new Map<string, RoleRow["sampleMembers"]>()
  const counts = new Map<string, number>()
  for (const m of memberRows) {
    counts.set(m.roleId, (counts.get(m.roleId) ?? 0) + 1)
    if (!membersByRole.has(m.roleId)) membersByRole.set(m.roleId, [])
    const list = membersByRole.get(m.roleId)!
    if (list.length < 5) list.push({ userId: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })
  }
  const invites = new Map(inviteCounts.map((r) => [r.roleId, r.n]))
  const defaultRoleId = ctx.org.settings.defaultRoleId ?? roles.find((r) => r.key === "member")?.id

  const order: Record<string, number> = { owner: 0, admin: 1, member: 2, guest: 3 }
  const rows: RoleRow[] = roles
    .sort(
      (a, b) =>
        Number(b.isSystem) - Number(a.isSystem) ||
        (order[a.key ?? ""] ?? 10) - (order[b.key ?? ""] ?? 10) ||
        a.name.localeCompare(b.name)
    )
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      color: r.color,
      permissions: r.permissions,
      isSystem: r.isSystem,
      memberCount: counts.get(r.id) ?? 0,
      pendingInvitations: invites.get(r.id) ?? 0,
      sampleMembers: membersByRole.get(r.id) ?? [],
      isDefault: r.id === defaultRoleId,
      isYours: r.id === ctx.role.id,
    }))

  return {
    roles: rows,
    isOwner: isOwnerCtx(ctx),
    /** Permissions the actor may grant (owners: all) */
    grantable: isOwnerCtx(ctx) ? null : [...ctx.permissions],
  }
}

export type RolesPageData = Awaited<ReturnType<typeof loadRolesPage>>
