import type { NextRequest } from "next/server"
import { startImpersonation } from "@/server/admin/impersonation"

/** POST /admin/impersonate/[userId] — sign in as another user (super admins only, audited). */
export async function POST(req: NextRequest, ctx: RouteContext<"/admin/impersonate/[userId]">) {
  const { userId } = await ctx.params
  return startImpersonation(req, userId)
}
