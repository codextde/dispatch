import "server-only"
import { and, asc, desc, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { getSettings, readSecret } from "@/server/settings"

/**
 * Super admin: workspace directory and lifecycle operations. Callers are
 * responsible for authorization (`adminAction` / `requireSuperAdminPage`).
 */

export const WORKSPACE_PAGE_SIZE = 25

export const PLANS = ["self_hosted", "free", "cloud", "comped"] as const
export const SUBSCRIPTION_STATUSES = ["none", "trialing", "active", "past_due", "canceled", "unpaid", "incomplete"] as const
export type Plan = (typeof PLANS)[number]
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID_RE.test(v)

/** Escape LIKE wildcards in user input. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

const o = schema.organizations
/** Fully qualified outer reference for correlated subqueries (drizzle omits the table name in single-table selects). */
const ORG_ID = sql.raw(`"organizations"."id"`)

/** First owner (by membership age) of each workspace. */
const ownerOf = (col: "id" | "email" | "name") => sql<string | null>`(
  select u.${sql.raw(col)} from ${schema.memberships} m
  join ${schema.roles} r on r.id = m.role_id
  join ${schema.users} u on u.id = m.user_id
  where m.org_id = ${ORG_ID} and r.key = 'owner'
  order by m.created_at asc limit 1
)`

export type WorkspaceListFilters = { q?: string; plan?: string; status?: string; page?: number }

export async function listWorkspaces(filters: WorkspaceListFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const where: SQL[] = []
  const q = filters.q?.trim()
  if (q) {
    const p = likePattern(q)
    where.push(sql`(
      ${o.name} ilike ${p} or ${o.slug} ilike ${p} or exists (
        select 1 from ${schema.memberships} m
        join ${schema.roles} r on r.id = m.role_id
        join ${schema.users} u on u.id = m.user_id
        where m.org_id = ${ORG_ID} and r.key = 'owner' and u.email ilike ${p}
      )
    )`)
  }
  if (filters.plan && (PLANS as readonly string[]).includes(filters.plan)) where.push(eq(o.plan, filters.plan as Plan))
  if (filters.status === "suspended") where.push(isNotNull(o.suspendedAt))
  else if (filters.status && (SUBSCRIPTION_STATUSES as readonly string[]).includes(filters.status)) {
    where.push(eq(o.subscriptionStatus, filters.status as SubscriptionStatus))
  }
  const cond = where.length ? and(...where) : undefined

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logoUrl: o.logoUrl,
        plan: o.plan,
        subscriptionStatus: o.subscriptionStatus,
        trialEndsAt: o.trialEndsAt,
        suspendedAt: o.suspendedAt,
        createdAt: o.createdAt,
        ownerId: ownerOf("id"),
        ownerEmail: ownerOf("email"),
        ownerName: ownerOf("name"),
        members: sql<number>`(select count(*)::int from ${schema.memberships} m where m.org_id = ${ORG_ID})`,
        inboxes: sql<number>`(select count(*)::int from ${schema.accounts} a where a.org_id = ${ORG_ID})`,
        inboxErrors: sql<number>`(select count(*)::int from ${schema.accounts} a where a.org_id = ${ORG_ID} and a.status = 'error')`,
        conversations: sql<number>`(select count(*)::int from ${schema.conversations} c where c.org_id = ${ORG_ID})`,
      })
      .from(o)
      .where(cond)
      .orderBy(desc(o.createdAt))
      .limit(WORKSPACE_PAGE_SIZE)
      .offset((page - 1) * WORKSPACE_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(o).where(cond),
  ])
  return { rows, total, page, pageSize: WORKSPACE_PAGE_SIZE }
}

export type WorkspaceListRow = Awaited<ReturnType<typeof listWorkspaces>>["rows"][number]

export async function getWorkspaceDetail(id: string) {
  if (!isUuid(id)) return null
  const org = await db.query.organizations.findFirst({ where: eq(o.id, id) })
  if (!org) return null

  const [creator, stats, members, inboxes, billing] = await Promise.all([
    org.createdBy
      ? db.query.users.findFirst({
          where: eq(schema.users.id, org.createdBy),
          columns: { id: true, email: true, name: true },
        })
      : Promise.resolve(undefined),
    db
      .select({
        conversations: sql<number>`(select count(*)::int from ${schema.conversations} c where c.org_id = ${id})`,
        openConversations: sql<number>`(select count(*)::int from ${schema.conversations} c where c.org_id = ${id} and c.status = 'open' and not c.is_trash and not c.is_spam)`,
        messages: sql<number>`(select count(*)::int from ${schema.messages} m where m.org_id = ${id})`,
        messages30d: sql<number>`(select count(*)::int from ${schema.messages} m where m.org_id = ${id} and m.created_at > now() - interval '30 days')`,
        lastActivityAt: sql<Date | null>`(select max(c.last_activity_at) from ${schema.conversations} c where c.org_id = ${id})`,
        teams: sql<number>`(select count(*)::int from ${schema.teams} t where t.org_id = ${id})`,
        pendingInvites: sql<number>`(select count(*)::int from ${schema.invitations} i where i.org_id = ${id} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())`,
      })
      .from(sql`(select 1) as one`)
      .then((r) => r[0]!),
    db
      .select({
        membershipId: schema.memberships.id,
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
        userStatus: schema.users.status,
        isSuperAdmin: schema.users.isSuperAdmin,
        lastSeenAt: schema.users.lastSeenAt,
        status: schema.memberships.status,
        title: schema.memberships.title,
        joinedAt: schema.memberships.createdAt,
        roleId: schema.roles.id,
        roleKey: schema.roles.key,
        roleName: schema.roles.name,
        roleColor: schema.roles.color,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(eq(schema.memberships.orgId, id))
      .orderBy(
        sql`case ${schema.roles.key} when 'owner' then 0 when 'admin' then 1 when 'member' then 2 when 'guest' then 3 else 4 end`,
        asc(schema.memberships.createdAt)
      ),
    db
      .select({
        id: schema.accounts.id,
        name: schema.accounts.name,
        email: schema.accounts.email,
        provider: schema.accounts.provider,
        status: schema.accounts.status,
        lastError: schema.accounts.lastError,
        lastSyncedAt: schema.accounts.lastSyncedAt,
        personal: sql<boolean>`${schema.accounts.ownerUserId} is not null`,
        createdAt: schema.accounts.createdAt,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.orgId, id))
      .orderBy(asc(schema.accounts.name)),
    getSettings("billing"),
  ])

  let stripeCustomerUrl: string | null = null
  if (org.stripeCustomerId) {
    const test = readSecret(billing.stripeSecretKeyEnc)?.startsWith("sk_test_") ?? false
    stripeCustomerUrl = `https://dashboard.stripe.com/${test ? "test/" : ""}customers/${encodeURIComponent(org.stripeCustomerId)}`
  }

  const owners = members.filter((m) => m.roleKey === "owner")
  return { org, creator: creator ?? null, stats, members, inboxes, owners, stripeCustomerUrl }
}

export type WorkspaceDetail = NonNullable<Awaited<ReturnType<typeof getWorkspaceDetail>>>

async function requireOrg(id: string) {
  const org = isUuid(id) ? await db.query.organizations.findFirst({ where: eq(o.id, id) }) : undefined
  if (!org) throw new ApiError(404, "Workspace not found")
  return org
}

export async function setWorkspacePlan(id: string, plan: Plan) {
  const before = await requireOrg(id)
  await db.update(o).set({ plan }).where(eq(o.id, id))
  return { before: before.plan, after: plan, org: before }
}

export async function setWorkspaceSubscriptionStatus(id: string, status: SubscriptionStatus) {
  const before = await requireOrg(id)
  await db.update(o).set({ subscriptionStatus: status }).where(eq(o.id, id))
  return { before: before.subscriptionStatus, after: status, org: before }
}

/** Extend the trial by `days` from max(now, current trial end). Sets status "trialing" if none. */
export async function extendWorkspaceTrial(id: string, days: number) {
  const org = await requireOrg(id)
  const base = Math.max(Date.now(), org.trialEndsAt?.getTime() ?? 0)
  const trialEndsAt = new Date(base + days * 86_400_000)
  const subscriptionStatus = org.subscriptionStatus === "none" ? "trialing" : org.subscriptionStatus
  await db.update(o).set({ trialEndsAt, subscriptionStatus }).where(eq(o.id, id))
  return { org, before: org.trialEndsAt, trialEndsAt, subscriptionStatus }
}

export async function suspendWorkspace(id: string, reason: string) {
  const org = await requireOrg(id)
  await db
    .update(o)
    .set({ suspendedAt: org.suspendedAt ?? new Date(), suspendedReason: reason || null })
    .where(eq(o.id, id))
  return org
}

export async function unsuspendWorkspace(id: string) {
  const org = await requireOrg(id)
  await db.update(o).set({ suspendedAt: null, suspendedReason: null }).where(eq(o.id, id))
  return org
}

/**
 * Make `userId` the owner. Previous owners are downgraded to the admin role.
 * Runs in one transaction.
 */
export async function transferWorkspaceOwnership(id: string, userId: string) {
  if (!isUuid(userId)) throw new ApiError(400, "Choose a member")
  return db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({ where: eq(o.id, id) })
    if (!org) throw new ApiError(404, "Workspace not found")
    const roles = await tx
      .select({ id: schema.roles.id, key: schema.roles.key })
      .from(schema.roles)
      .where(and(eq(schema.roles.orgId, id), inArray(schema.roles.key, ["owner", "admin"])))
    const ownerRole = roles.find((r) => r.key === "owner")
    const adminRole = roles.find((r) => r.key === "admin")
    if (!ownerRole || !adminRole) throw new ApiError(409, "This workspace is missing its system roles")

    const target = await tx
      .select({ id: schema.memberships.id, status: schema.memberships.status, roleId: schema.memberships.roleId, userStatus: schema.users.status, email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, id), eq(schema.memberships.userId, userId)))
      .for("update")
      .then((r) => r[0])
    if (!target) throw new ApiError(404, "That person is not a member of this workspace")
    if (target.status !== "active" || target.userStatus !== "active") throw new ApiError(400, "Only active members can become the owner")

    const previous = await tx
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, id), eq(schema.memberships.roleId, ownerRole.id), ne(schema.memberships.userId, userId)))
    await tx
      .update(schema.memberships)
      .set({ roleId: adminRole.id })
      .where(and(eq(schema.memberships.orgId, id), eq(schema.memberships.roleId, ownerRole.id), ne(schema.memberships.userId, userId)))
    await tx.update(schema.memberships).set({ roleId: ownerRole.id }).where(eq(schema.memberships.id, target.id))
    return { org, newOwnerEmail: target.email, previousOwnerIds: previous.map((p) => p.userId) }
  })
}

export async function deleteWorkspace(id: string) {
  const org = await requireOrg(id)
  await db.delete(o).where(eq(o.id, id))
  return org
}

/** Workspaces whose only (active) owner is this user — blocks deleting the user. */
export async function soleOwnedWorkspaces(userId: string) {
  const rows = await db.execute<{ id: string; name: string; slug: string }>(sql`
    select o.id, o.name, o.slug
    from ${schema.memberships} m
    join ${schema.roles} r on r.id = m.role_id and r.key = 'owner'
    join ${schema.organizations} o on o.id = m.org_id
    where m.user_id = ${userId}
      and not exists (
        select 1 from ${schema.memberships} m2
        join ${schema.roles} r2 on r2.id = m2.role_id and r2.key = 'owner'
        join ${schema.users} u2 on u2.id = m2.user_id
        where m2.org_id = m.org_id and m2.user_id <> ${userId} and m2.status = 'active' and u2.status = 'active'
      )
    order by o.name
  `)
  return [...rows]
}
