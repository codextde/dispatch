import "server-only"
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm"
import { db, schema, type Tx } from "@/server/db"
import { ApiError } from "@/server/api"
import { listSessions } from "@/server/auth/session"
import { isUuid, likePattern, soleOwnedWorkspaces } from "@/server/admin/workspaces"

/**
 * Super admin: user directory and account operations. Guards that protect
 * the instance (never remove/disable the last super admin, never act on
 * yourself destructively) are enforced here, inside transactions.
 */

export const USER_PAGE_SIZE = 25
const u = schema.users
/** Fully qualified outer reference for correlated subqueries. */
const USER_ID = sql.raw(`"users"."id"`)

export type UserListFilters = { q?: string; filter?: string; page?: number }

export async function listUsers(filters: UserListFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const where: SQL[] = []
  const q = filters.q?.trim()
  if (q) {
    const p = likePattern(q)
    where.push(sql`(${u.email} ilike ${p} or ${u.name} ilike ${p})`)
  }
  if (filters.filter === "super_admins") where.push(eq(u.isSuperAdmin, true))
  else if (filters.filter === "disabled") where.push(eq(u.status, "disabled"))
  else if (filters.filter === "active") where.push(eq(u.status, "active"))
  const cond = where.length ? and(...where) : undefined

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        isSuperAdmin: u.isSuperAdmin,
        status: u.status,
        lastSeenAt: u.lastSeenAt,
        createdAt: u.createdAt,
        workspaces: sql<number>`(select count(*)::int from ${schema.memberships} m where m.user_id = ${USER_ID})`,
        sessions: sql<number>`(select count(*)::int from ${schema.sessions} s where s.user_id = ${USER_ID} and s.expires_at > now())`,
      })
      .from(u)
      .where(cond)
      .orderBy(desc(u.createdAt))
      .limit(USER_PAGE_SIZE)
      .offset((page - 1) * USER_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(u).where(cond),
  ])
  return { rows, total, page, pageSize: USER_PAGE_SIZE }
}

export type UserListRow = Awaited<ReturnType<typeof listUsers>>["rows"][number]

export async function getUserDetail(id: string) {
  if (!isUuid(id)) return null
  const user = await db.query.users.findFirst({ where: eq(u.id, id) })
  if (!user) return null
  const [memberships, sessions, events, soleOwned, superAdmins] = await Promise.all([
    db
      .select({
        orgId: schema.organizations.id,
        orgName: schema.organizations.name,
        orgSlug: schema.organizations.slug,
        suspendedAt: schema.organizations.suspendedAt,
        roleKey: schema.roles.key,
        roleName: schema.roles.name,
        status: schema.memberships.status,
        joinedAt: schema.memberships.createdAt,
      })
      .from(schema.memberships)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(eq(schema.memberships.userId, id))
      .orderBy(schema.organizations.name),
    listSessions(id),
    db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        targetType: schema.auditLogs.targetType,
        targetId: schema.auditLogs.targetId,
        ip: schema.auditLogs.ip,
        createdAt: schema.auditLogs.createdAt,
        orgId: schema.auditLogs.orgId,
        orgName: schema.organizations.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.organizations, eq(schema.organizations.id, schema.auditLogs.orgId))
      .where(eq(schema.auditLogs.actorId, id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(20),
    soleOwnedWorkspaces(id),
    countActiveSuperAdmins(),
  ])
  return { user, memberships, sessions, events, soleOwned, activeSuperAdmins: superAdmins }
}

export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserDetail>>>

export async function countActiveSuperAdmins() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(u)
    .where(and(eq(u.isSuperAdmin, true), eq(u.status, "active")))
  return row?.n ?? 0
}

/** Lock all super admin rows so concurrent demotions can't remove the last one. */
async function lockSuperAdmins(tx: Tx) {
  await tx.execute(sql`select id from ${u} where ${u.isSuperAdmin} = true for update`)
}

async function loadTarget(tx: Tx, id: string) {
  if (!isUuid(id)) throw new ApiError(404, "User not found")
  const target = await tx.query.users.findFirst({ where: eq(u.id, id) })
  if (!target) throw new ApiError(404, "User not found")
  return target
}

/** Would removing `targetId` from the active super admins leave none? */
async function isLastActiveSuperAdmin(tx: Tx, targetId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(u)
    .where(and(eq(u.isSuperAdmin, true), eq(u.status, "active"), ne(u.id, targetId)))
  return (row?.n ?? 0) === 0
}

/** End impersonation sessions started by this admin (when they lose admin rights or their account). */
async function endImpersonationsBy(tx: Tx, adminId: string) {
  await tx.delete(schema.sessions).where(eq(schema.sessions.impersonatorId, adminId))
}

export async function setUserSuperAdmin(actorId: string, targetId: string, value: boolean) {
  return db.transaction(async (tx) => {
    await lockSuperAdmins(tx)
    const target = await loadTarget(tx, targetId)
    if (target.isSuperAdmin === value) return target
    if (!value) {
      if (target.id === actorId) throw new ApiError(400, "You can't remove your own super admin access.")
      if (await isLastActiveSuperAdmin(tx, target.id)) throw new ApiError(400, "This is the last super admin — promote someone else first.")
    } else if (target.status !== "active") {
      throw new ApiError(400, "Enable this account before granting super admin access.")
    }
    const [updated] = await tx.update(u).set({ isSuperAdmin: value }).where(eq(u.id, target.id)).returning()
    if (!value) await endImpersonationsBy(tx, target.id)
    return updated!
  })
}

/** Disable (revokes every session) or re-enable an account. */
export async function setUserStatus(actorId: string, targetId: string, status: "active" | "disabled") {
  return db.transaction(async (tx) => {
    await lockSuperAdmins(tx)
    const target = await loadTarget(tx, targetId)
    if (target.status === status) return { user: target, revokedSessions: 0 }
    let revokedSessions = 0
    if (status === "disabled") {
      if (target.id === actorId) throw new ApiError(400, "You can't disable your own account.")
      if (target.isSuperAdmin && (await isLastActiveSuperAdmin(tx, target.id))) {
        throw new ApiError(400, "This is the last active super admin and can't be disabled.")
      }
      const deleted = await tx
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, target.id))
        .returning({ id: schema.sessions.id })
      revokedSessions = deleted.length
      await endImpersonationsBy(tx, target.id)
    }
    const [updated] = await tx.update(u).set({ status }).where(eq(u.id, target.id)).returning()
    return { user: updated!, revokedSessions }
  })
}

export async function revokeUserSession(targetId: string, sessionId: string, currentSessionId: string) {
  if (!isUuid(targetId) || !isUuid(sessionId)) throw new ApiError(404, "Session not found")
  if (sessionId === currentSessionId) throw new ApiError(400, "That's your current session — use Sign out instead.")
  const deleted = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, targetId)))
    .returning({ id: schema.sessions.id, deviceLabel: schema.sessions.deviceLabel })
  if (!deleted.length) throw new ApiError(404, "Session not found")
  return deleted[0]!
}

/** Revoke all sessions of a user. For yourself, the current session is kept. */
export async function revokeAllUserSessions(targetId: string, current: { userId: string; sessionId: string }) {
  if (!isUuid(targetId)) throw new ApiError(404, "User not found")
  const where =
    targetId === current.userId
      ? and(eq(schema.sessions.userId, targetId), ne(schema.sessions.id, current.sessionId))
      : eq(schema.sessions.userId, targetId)
  const deleted = await db.delete(schema.sessions).where(where).returning({ id: schema.sessions.id })
  return deleted.length
}

/** Pre-flight for deleting a user (also used by the UI to explain why it's blocked). */
export async function userDeletionBlockers(actorId: string, targetId: string) {
  const target = isUuid(targetId) ? await db.query.users.findFirst({ where: eq(u.id, targetId) }) : undefined
  if (!target) return { target: null, reason: "User not found", soleOwned: [] as { id: string; name: string; slug: string }[] }
  if (target.id === actorId) return { target, reason: "You can't delete your own account.", soleOwned: [] }
  if (target.isSuperAdmin) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(u)
      .where(and(eq(u.isSuperAdmin, true), eq(u.status, "active"), ne(u.id, target.id)))
    if (!row?.n) return { target, reason: "This is the last super admin and can't be deleted.", soleOwned: [] }
  }
  const soleOwned = await soleOwnedWorkspaces(target.id)
  if (soleOwned.length) {
    return { target, reason: "This user is the only owner of some workspaces. Transfer ownership first.", soleOwned }
  }
  return { target, reason: null, soleOwned }
}

export async function deleteUser(actorId: string, targetId: string) {
  const check = await userDeletionBlockers(actorId, targetId)
  if (!check.target) throw new ApiError(404, "User not found")
  if (check.reason) {
    const names = check.soleOwned.map((w) => w.name).join(", ")
    throw new ApiError(400, names ? `${check.reason} (${names})` : check.reason)
  }
  return db.transaction(async (tx) => {
    await lockSuperAdmins(tx)
    const target = await loadTarget(tx, targetId)
    if (target.isSuperAdmin && (await isLastActiveSuperAdmin(tx, target.id))) {
      throw new ApiError(400, "This is the last super admin and can't be deleted.")
    }
    await endImpersonationsBy(tx, target.id)
    await tx.delete(u).where(eq(u.id, target.id))
    return target
  })
}
