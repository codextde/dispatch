import "server-only"
import type { NextRequest } from "next/server"
import { ApiError, requireApiOrg, type ApiContext } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { isUuid } from "@/lib/inbox/boxes"
import type { Permission } from "@/lib/permissions"
import { loadScope, type InboxScope } from "./scope"

type ReadScope = "conversations.read" | "contacts.read" | "tasks.read"

/** Whoever may change an area may also read it. */
const IMPLIED_BY: Record<ReadScope, Permission[]> = {
  "conversations.read": ["conversations.reply"],
  "contacts.read": ["contacts.manage"],
  "tasks.read": ["tasks.manage"],
}

/** An API key with scopes: they intersect the role's permissions, so it has fewer than its role. */
function isRestrictedKey(ctx: ApiContext) {
  return ctx.via === "api_key" && ctx.role.permissions.some((p) => !ctx.permissions.has(p))
}

/**
 * Restricted API keys (keys with scopes) only reach the areas their scopes
 * name: the read scope or the matching write permission. Sessions and
 * full-access keys are unaffected; their role and inbox access decide.
 */
export function assertApiScope(ctx: ApiContext, scope: ReadScope) {
  if (!isRestrictedKey(ctx) || ctx.permissions.has(scope) || IMPLIED_BY[scope].some((p) => ctx.permissions.has(p))) return
  throw new ApiError(403, `This API key is missing the “${scope}” scope`, "forbidden")
}

/**
 * Auth + visibility scope for inbox route handlers.
 *   const { ctx, scope } = await inboxContext(req, slug, { write: true })
 */
export async function inboxContext(req: NextRequest, slug: string, opts: { write?: boolean } = {}): Promise<{ ctx: ApiContext; scope: InboxScope }> {
  const ctx = await requireApiOrg(req, slug)
  assertApiScope(ctx, "conversations.read")
  // A restricted key with only the read scope stays read-only (no comments, drafts or flags).
  if (opts.write && isRestrictedKey(ctx) && !ctx.permissions.has("conversations.reply")) {
    throw new ApiError(403, "This API key is missing the “conversations.reply” scope", "forbidden")
  }
  if (opts.write) assertWritable(ctx)
  const scope = await loadScope(ctx)
  return { ctx, scope }
}

export function assertUuid(value: string, what = "Resource"): string {
  if (!isUuid(value)) throw new ApiError(404, `${what} not found`, "not_found")
  return value
}
