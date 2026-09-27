import { json, requireApiOrg, route } from "@/server/api"
import { assertApiScope } from "@/server/conversations/context"
import { taskOptions } from "@/server/tasks"

type P = { slug: string }

/** GET /api/w/[slug]/tasks/options → { members, teams, canManage } for assignee/team pickers */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertApiScope(ctx, "tasks.read")
  return json(await taskOptions(ctx))
})
