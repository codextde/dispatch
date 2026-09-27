import "server-only"
import { revalidatePath } from "next/cache"
import { assertPermission, assertWritable, AuthError, requireOrg, type OrgContext } from "@/server/authz"
import { audit } from "@/server/audit"
import { ApiError } from "@/server/api"
import { getRequestMeta } from "@/server/request"
import type { Permission } from "@/lib/permissions"

/**
 * Shared helpers for workspace settings server actions.
 *
 *   const ctx = await workspaceAction(input.slug, "labels.manage")
 *   ...mutate (always scoped to ctx.org.id)...
 *   await auditAction(ctx, "label.created", { type: "label", id: label.id }, { name })
 *   revalidateSettings()
 */

/**
 * Resolve the workspace for a mutation: member check, optional permission
 * (any of the given permissions), and read-only lock check.
 */
export async function workspaceAction(slug: string, perm?: Permission | Permission[]): Promise<OrgContext> {
  const ctx = await requireOrg(slug)
  if (perm) assertAnyPermission(ctx, perm)
  assertWritable(ctx)
  return ctx
}

/**
 * Personal (user-level) mutations like profile, preferences and sessions are
 * allowed even while the workspace is read-only.
 */
export async function personalAction(slug: string): Promise<OrgContext> {
  return requireOrg(slug)
}

export function assertAnyPermission(ctx: Pick<OrgContext, "permissions">, perm: Permission | Permission[]) {
  const perms = Array.isArray(perm) ? perm : [perm]
  if (perms.length === 1) return assertPermission(ctx, perms[0]!)
  if (!perms.some((p) => ctx.permissions.has(p))) throw new AuthError(403, `Missing permission: ${perms.join(" or ")}`)
}

/**
 * Impersonation is for looking at a user's workspace, not for acting on their
 * credentials: sessions, API keys, webhooks and mailbox connections outlive the
 * impersonation and must not be changed by it.
 */
export function assertNotImpersonating(ctx: Pick<OrgContext, "session">, what: string) {
  if (ctx.session.impersonatorId) fail(`You can't ${what} while impersonating this user.`, 403)
}

export async function auditAction(
  ctx: Pick<OrgContext, "org" | "user"> & Partial<Pick<OrgContext, "session">>,
  action: string,
  target?: { type: string; id: string } | null,
  metadata?: Record<string, unknown>
) {
  const meta = await getRequestMeta()
  // Changes made while a super admin impersonates the user are attributed to both
  const impersonatorId = ctx.session?.impersonatorId
  if (impersonatorId) metadata = { ...metadata, impersonatorId }
  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata,
  })
}

/** Re-render every settings page (and the settings layout) after a mutation. */
export function revalidateSettings() {
  revalidatePath("/w/[slug]/settings", "layout")
}

/** Re-render the whole workspace (org name, avatar, labels in sidebars ...). */
export function revalidateWorkspace() {
  revalidatePath("/w/[slug]", "layout")
}

/** Abort a server action with a user-facing message (shown as a toast). */
export function fail(message: string, status = 400): never {
  throw new ApiError(status, message, "invalid")
}
