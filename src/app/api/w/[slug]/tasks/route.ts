import { json, parseJson, parseQuery, requireApiOrg, route } from "@/server/api"
import { assertApiScope } from "@/server/conversations/context"
import { assertWritable } from "@/server/authz"
import { createTask, listTasks, taskFiltersSchema, taskInputSchema } from "@/server/tasks"

type P = { slug: string }

/** GET /api/w/[slug]/tasks?assignee=me|anyone|unassigned|<userId>&status=todo,in_progress&teamId&conversationId&due&q&tz → { tasks } */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertApiScope(ctx, "tasks.read")
  const filters = parseQuery(req, taskFiltersSchema)
  return json({ tasks: await listTasks(ctx, filters) })
})

/** POST /api/w/[slug]/tasks → TaskDto */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertApiScope(ctx, "tasks.read")
  assertWritable(ctx)
  const input = await parseJson(req, taskInputSchema)
  return json(await createTask(ctx, input), 201)
})
