import "server-only"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { fail } from "@/server/workspace/context"
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/permissions"

/**
 * Roles & permission guards shared by the members, teams and roles settings.
 * Service functions take an org context and plain input so they can be
 * exercised outside a request (the server actions are thin wrappers).
 */

export type ServiceCtx = Pick<OrgContext, "org" | "user" | "role" | "permissions">

export const isOwnerCtx = (ctx: Pick<OrgContext, "role">) => ctx.role.key === "owner"

/** Non-owners may only hand out permissions they hold themselves. */
export function canGrantPermissions(ctx: Pick<OrgContext, "role" | "permissions">, perms: readonly string[]) {
  return isOwnerCtx(ctx) || perms.every((p) => ctx.permissions.has(p))
}

/** Can the actor give this role to someone (invite or role change)? */
export function canGrantRole(
  ctx: Pick<OrgContext, "role" | "permissions">,
  role: { key: string | null; permissions: readonly string[] }
) {
  if (role.key === "owner") return isOwnerCtx(ctx)
  return canGrantPermissions(ctx, role.permissions)
}

export async function getOrgRole(orgId: string, roleId: string, tx: DbOrTx = db) {
  const role = await tx.query.roles.findFirst({
    where: and(eq(schema.roles.id, roleId), eq(schema.roles.orgId, orgId)),
  })
  if (!role) fail("Role not found", 404)
  return role
}

export async function getSystemRoleId(orgId: string, key: "owner" | "admin" | "member" | "guest", tx: DbOrTx = db) {
  const role = await tx.query.roles.findFirst({
    where: and(eq(schema.roles.orgId, orgId), eq(schema.roles.key, key)),
    columns: { id: true },
  })
  return role?.id ?? null
}

/** Active owners of the org, optionally excluding one user. */
export async function countActiveOwners(orgId: string, excludeUserId?: string, tx: DbOrTx = db) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        eq(schema.roles.key, "owner"),
        eq(schema.memberships.status, "active"),
        excludeUserId ? ne(schema.memberships.userId, excludeUserId) : undefined
      )
    )
  return row?.n ?? 0
}

function normalizePermissions(perms: readonly string[]): Permission[] {
  const valid = new Set<string>(ALL_PERMISSIONS)
  const unknown = perms.filter((p) => !valid.has(p))
  if (unknown.length) fail(`Unknown permission: ${unknown[0]}`)
  // Keep the canonical order for stable diffs
  return ALL_PERMISSIONS.filter((p) => perms.includes(p))
}

async function assertUniqueName(orgId: string, name: string, excludeId?: string) {
  const clash = await db.query.roles.findFirst({
    where: and(
      eq(schema.roles.orgId, orgId),
      sql`lower(${schema.roles.name}) = ${name.toLowerCase()}`,
      excludeId ? ne(schema.roles.id, excludeId) : undefined
    ),
    columns: { id: true },
  })
  if (clash) fail("A role with this name already exists")
}

const LOCKOUT_PERMS: Permission[] = ["roles.manage", "members.manage"]

export type RoleInput = { name: string; description?: string | null; color?: string | null; permissions: string[] }

export async function createRole(ctx: ServiceCtx, input: RoleInput) {
  const name = input.name.trim()
  if (!name) fail("Name is required")
  const permissions = normalizePermissions(input.permissions)
  if (!canGrantPermissions(ctx, permissions)) {
    fail("You can only grant permissions that you have yourself")
  }
  await assertUniqueName(ctx.org.id, name)
  const [role] = await db
    .insert(schema.roles)
    .values({
      orgId: ctx.org.id,
      name,
      description: input.description?.trim() || null,
      color: input.color || "#64748b",
      permissions,
      isSystem: false,
    })
    .returning()
  return role!
}

export async function updateRole(ctx: ServiceCtx, input: RoleInput & { id: string }) {
  const role = await getOrgRole(ctx.org.id, input.id)
  if (role.key === "owner") fail("The Owner role always has every permission and can't be edited")
  const permissions = normalizePermissions(input.permissions)
  const before = new Set(role.permissions)
  const added = permissions.filter((p) => !before.has(p))
  const removed = role.permissions.filter((p) => !permissions.includes(p as Permission))
  if (!canGrantPermissions(ctx, added)) fail("You can only grant permissions that you have yourself")
  // Editing a role affects everyone holding it: only possible for roles that don't outrank you
  if (!canGrantPermissions(ctx, role.permissions)) fail("You can't edit a role that has permissions you don't have", 403)
  if (role.id === ctx.role.id && !isOwnerCtx(ctx)) {
    const lost = LOCKOUT_PERMS.filter((p) => removed.includes(p))
    if (lost.length) {
      fail(`You can't remove “${lost.map((p) => PERMISSIONS[p].label).join("” and “")}” from your own role — you would lock yourself out.`)
    }
  }

  const patch: Partial<typeof schema.roles.$inferInsert> = {
    permissions,
    color: input.color || role.color,
    description: input.description === undefined ? role.description : input.description?.trim() || null,
  }
  if (!role.isSystem) {
    const name = input.name.trim()
    if (!name) fail("Name is required")
    if (name.toLowerCase() !== role.name.toLowerCase()) await assertUniqueName(ctx.org.id, name, role.id)
    patch.name = name
  }
  const [updated] = await db
    .update(schema.roles)
    .set(patch)
    .where(and(eq(schema.roles.id, role.id), eq(schema.roles.orgId, ctx.org.id)))
    .returning()
  return { role: updated!, added, removed }
}

/**
 * Delete a custom role. Members and invitations holding it must be moved to
 * `reassignToRoleId` (required when the role is in use).
 */
export async function deleteRole(ctx: ServiceCtx, input: { id: string; reassignToRoleId?: string | null }) {
  const role = await getOrgRole(ctx.org.id, input.id)
  if (role.isSystem) fail("System roles can't be deleted")
  if (!canGrantPermissions(ctx, role.permissions)) fail("You can't delete a role that has permissions you don't have", 403)

  const [memberCount, invitationCount] = await Promise.all([
    countRoleMembers(ctx.org.id, role.id),
    countPendingInvitations(ctx.org.id, role.id),
  ])
  const inUse = memberCount + invitationCount > 0

  let target: typeof schema.roles.$inferSelect | null = null
  if (inUse) {
    if (!input.reassignToRoleId) fail("This role is in use — choose a role to move its members to")
    if (input.reassignToRoleId === role.id) fail("Choose a different role")
    target = await getOrgRole(ctx.org.id, input.reassignToRoleId)
    if (!canGrantRole(ctx, target)) fail("You can't move members to a role with more permissions than you have")
  } else if (input.reassignToRoleId) {
    target = await getOrgRole(ctx.org.id, input.reassignToRoleId)
  }

  if (role.id === ctx.role.id && !isOwnerCtx(ctx)) {
    const next = new Set(target?.permissions ?? [])
    if (!LOCKOUT_PERMS.every((p) => next.has(p))) {
      fail("You can't delete your own role unless you move to a role that can still manage roles and members")
    }
  }

  const memberRoleId = await getSystemRoleId(ctx.org.id, "member")
  await db.transaction(async (tx) => {
    if (target) {
      await tx
        .update(schema.memberships)
        .set({ roleId: target.id })
        .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.roleId, role.id)))
      // Keep invitation history: move every invitation (accepted/revoked ones too) instead of cascading
      await tx
        .update(schema.invitations)
        .set({ roleId: target.id })
        .where(and(eq(schema.invitations.orgId, ctx.org.id), eq(schema.invitations.roleId, role.id)))
    }
    const org = await tx.query.organizations.findFirst({
      where: eq(schema.organizations.id, ctx.org.id),
      columns: { settings: true },
    })
    if (org?.settings.defaultRoleId === role.id) {
      await tx
        .update(schema.organizations)
        .set({ settings: { ...org.settings, defaultRoleId: memberRoleId ?? undefined } })
        .where(eq(schema.organizations.id, ctx.org.id))
    }
    await tx.delete(schema.roles).where(and(eq(schema.roles.id, role.id), eq(schema.roles.orgId, ctx.org.id)))
  })

  return { role, movedTo: target, members: memberCount, invitations: invitationCount }
}

export async function countRoleMembers(orgId: string, roleId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.roleId, roleId)))
  return row?.n ?? 0
}

/** Pending (not accepted / revoked) invitations holding a role. */
export async function countPendingInvitations(orgId: string, roleId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.orgId, orgId),
        eq(schema.invitations.roleId, roleId),
        isNull(schema.invitations.acceptedAt),
        isNull(schema.invitations.revokedAt)
      )
    )
  return row?.n ?? 0
}
