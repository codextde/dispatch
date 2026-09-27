import "server-only"
import { cache } from "react"
import { redirect, notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getCurrentSession, type CurrentSession } from "@/server/auth/session"
import { getSettings } from "@/server/settings"
import type { Permission } from "@/lib/permissions"

/**
 * Authorization helpers.
 *
 * Page/layout usage (redirects on failure):
 *   const ctx = await requireOrgPage(slug)            // member of workspace
 *   requirePagePermission(ctx, "members.manage")      // 404 if missing
 *   const admin = await requireSuperAdminPage()
 *
 * Server actions / API usage (throws AuthError):
 *   const ctx = await requireOrg(slug)
 *   assertPermission(ctx, "labels.manage")
 */

export class AuthError extends Error {
  constructor(
    public status: 401 | 403 | 404 | 402 | 423,
    message: string,
    public code = status === 401 ? "unauthenticated" : status === 403 ? "forbidden" : status === 402 ? "payment_required" : status === 423 ? "locked" : "not_found"
  ) {
    super(message)
  }
}

export type OrgContext = CurrentSession & {
  org: typeof schema.organizations.$inferSelect
  membership: typeof schema.memberships.$inferSelect
  role: typeof schema.roles.$inferSelect
  permissions: Set<string>
  /** Workspace is read-only (billing lapsed or suspended) */
  locked: false | { reason: "suspended" | "billing"; message: string }
}

export async function requireUser(): Promise<CurrentSession> {
  const s = await getCurrentSession()
  if (!s) throw new AuthError(401, "Not signed in")
  return s
}

export async function requireUserPage(nextPath?: string): Promise<CurrentSession> {
  const s = await getCurrentSession()
  if (!s) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login")
  return s
}

export async function requireSuperAdmin(): Promise<CurrentSession> {
  const s = await requireUser()
  if (!s.user.isSuperAdmin) throw new AuthError(403, "Super admin only")
  return s
}

export async function requireSuperAdminPage(): Promise<CurrentSession> {
  const s = await requireUserPage("/admin")
  if (!s.user.isSuperAdmin) notFound()
  return s
}

export async function computeLock(org: typeof schema.organizations.$inferSelect): Promise<OrgContext["locked"]> {
  if (org.suspendedAt) {
    return { reason: "suspended", message: org.suspendedReason || "This workspace has been suspended by the instance administrator." }
  }
  if (org.plan !== "cloud") return false
  const [general, billing] = await Promise.all([getSettings("general"), getSettings("billing")])
  if (general.mode !== "saas" || !billing.enabled || !billing.enforce) return false
  const status = org.subscriptionStatus
  if (status === "active" || status === "past_due") return false
  if (status === "trialing" && (!org.trialEndsAt || org.trialEndsAt > new Date())) return false
  return {
    reason: "billing",
    message:
      status === "trialing"
        ? "Your free trial has ended. Subscribe to keep using this workspace."
        : "This workspace has no active subscription. Subscribe to continue.",
  }
}

/** Load org context for the current user (memoized per request). */
export const loadOrgContext = cache(async (slug: string): Promise<OrgContext | null> => {
  const s = await getCurrentSession()
  if (!s) return null
  const rows = await db
    .select({ org: schema.organizations, membership: schema.memberships, role: schema.roles })
    .from(schema.organizations)
    .innerJoin(
      schema.memberships,
      and(eq(schema.memberships.orgId, schema.organizations.id), eq(schema.memberships.userId, s.user.id))
    )
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(eq(schema.organizations.slug, slug))
    .limit(1)
  const row = rows[0]
  if (!row || row.membership.status !== "active") return null
  return {
    ...s,
    org: row.org,
    membership: row.membership,
    role: row.role,
    permissions: new Set(row.role.permissions),
    locked: await computeLock(row.org),
  }
})

export async function requireOrg(slug: string): Promise<OrgContext> {
  const s = await getCurrentSession()
  if (!s) throw new AuthError(401, "Not signed in")
  const ctx = await loadOrgContext(slug)
  if (!ctx) throw new AuthError(404, "Workspace not found")
  return ctx
}

export async function requireOrgPage(slug: string): Promise<OrgContext> {
  await requireUserPage(`/w/${slug}/inbox`)
  const ctx = await loadOrgContext(slug)
  if (!ctx) notFound()
  return ctx
}

export function can(ctx: Pick<OrgContext, "permissions">, perm: Permission): boolean {
  return ctx.permissions.has(perm)
}

export function assertPermission(ctx: Pick<OrgContext, "permissions">, perm: Permission) {
  if (!ctx.permissions.has(perm)) throw new AuthError(403, `Missing permission: ${perm}`)
}

export function requirePagePermission(ctx: Pick<OrgContext, "permissions">, perm: Permission) {
  if (!ctx.permissions.has(perm)) notFound()
}

/** Throw if the workspace is read-only (use before any mutation). */
export function assertWritable(ctx: Pick<OrgContext, "locked">) {
  if (ctx.locked) throw new AuthError(ctx.locked.reason === "billing" ? 402 : 423, ctx.locked.message)
}

/** Owner check (role key "owner"). */
export function isOwner(ctx: Pick<OrgContext, "role">) {
  return ctx.role.key === "owner"
}
