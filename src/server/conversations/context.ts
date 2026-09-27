import "server-only"
import type { NextRequest } from "next/server"
import { ApiError, requireApiOrg, type ApiContext } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { isUuid } from "@/lib/inbox/boxes"
import { loadScope, type InboxScope } from "./scope"

/**
 * Auth + visibility scope for inbox route handlers.
 *   const { ctx, scope } = await inboxContext(req, slug, { write: true })
 */
export async function inboxContext(req: NextRequest, slug: string, opts: { write?: boolean } = {}): Promise<{ ctx: ApiContext; scope: InboxScope }> {
  const ctx = await requireApiOrg(req, slug)
  if (opts.write) assertWritable(ctx)
  const scope = await loadScope(ctx)
  return { ctx, scope }
}

export function assertUuid(value: string, what = "Resource"): string {
  if (!isUuid(value)) throw new ApiError(404, `${what} not found`, "not_found")
  return value
}
