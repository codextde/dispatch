import "server-only"
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"

/**
 * Small, serializable lookups shared by settings pages (pickers for members,
 * teams, inboxes, labels, roles ...). Every query is scoped to one org.
 */

export type MemberOption = {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  status: "active" | "suspended"
  roleId: string
}

export async function listMemberOptions(orgId: string, opts: { includeSuspended?: boolean } = {}): Promise<MemberOption[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      status: schema.memberships.status,
      roleId: schema.memberships.roleId,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        opts.includeSuspended ? undefined : eq(schema.memberships.status, "active")
      )
    )
    .orderBy(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`)
  return rows
}

export type TeamOption = { id: string; name: string; color: string }

export async function listTeamOptions(orgId: string): Promise<TeamOption[]> {
  return db
    .select({ id: schema.teams.id, name: schema.teams.name, color: schema.teams.color })
    .from(schema.teams)
    .where(eq(schema.teams.orgId, orgId))
    .orderBy(asc(schema.teams.name))
}

export type AccountOption = {
  id: string
  name: string
  email: string
  color: string
  provider: string
  ownerUserId: string | null
}

/** Shared inboxes, plus the personal inboxes of `personalOf` when given. */
export async function listAccountOptions(orgId: string, opts: { personalOf?: string; allPersonal?: boolean } = {}): Promise<AccountOption[]> {
  const a = schema.accounts
  return db
    .select({ id: a.id, name: a.name, email: a.email, color: a.color, provider: a.provider, ownerUserId: a.ownerUserId })
    .from(a)
    .where(
      and(
        eq(a.orgId, orgId),
        opts.allPersonal ? undefined : opts.personalOf ? or(isNull(a.ownerUserId), eq(a.ownerUserId, opts.personalOf)) : isNull(a.ownerUserId)
      )
    )
    .orderBy(asc(a.name))
}

export type LabelOption = { id: string; name: string; color: string; parentId: string | null; visibility: "shared" | "private" }

/** Shared labels plus the private labels of `userId`. */
export async function listLabelOptions(orgId: string, userId: string): Promise<LabelOption[]> {
  const l = schema.labels
  return db
    .select({ id: l.id, name: l.name, color: l.color, parentId: l.parentId, visibility: l.visibility })
    .from(l)
    .where(and(eq(l.orgId, orgId), or(eq(l.visibility, "shared"), eq(l.ownerUserId, userId))))
    .orderBy(asc(l.position), asc(l.name))
}

export type RoleOption = { id: string; key: string | null; name: string; color: string | null; isSystem: boolean }

export async function listRoleOptions(orgId: string): Promise<RoleOption[]> {
  const r = schema.roles
  const rows = await db
    .select({ id: r.id, key: r.key, name: r.name, color: r.color, isSystem: r.isSystem })
    .from(r)
    .where(eq(r.orgId, orgId))
  const order: Record<string, number> = { owner: 0, admin: 1, member: 2, guest: 3 }
  return rows.sort((x, y) => (order[x.key ?? ""] ?? 10) - (order[y.key ?? ""] ?? 10) || x.name.localeCompare(y.name))
}

/**
 * Verify that all ids belong to rows of `table` in this org. Use before
 * writing client-provided foreign keys. Returns the valid subset.
 */
export async function filterOrgIds(
  table: "teams" | "labels" | "accounts" | "roles" | "cannedResponses" | "signatures",
  orgId: string,
  ids: readonly string[]
): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []
  const t = schema[table]
  const rows = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.orgId, orgId), inArray(t.id, unique)))
  return rows.map((r) => r.id)
}

/** Verify user ids are members of the org (active unless includeSuspended). */
export async function filterMemberIds(orgId: string, userIds: readonly string[], includeSuspended = false): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return []
  const rows = await db
    .select({ id: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        inArray(schema.memberships.userId, unique),
        includeSuspended ? undefined : eq(schema.memberships.status, "active")
      )
    )
  return rows.map((r) => r.id)
}
