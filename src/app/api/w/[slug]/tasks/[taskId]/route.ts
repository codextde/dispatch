import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertApiScope } from "@/server/conversations/context"
import { assertWritable } from "@/server/authz"
import { deleteTask, getTask, taskInputSchema, updateTask } from "@/server/tasks"

type P = { slug: string; taskId: string }

/** GET /api/w/[slug]/tasks/[taskId] → TaskDto */
export const GET = route<P>(async (req, { params }) => {
  const { slug, taskId } = await params
  const ctx = await requireApiOrg(req, slug)
  assertApiScope(ctx, "tasks.read")
  const task = await getTask(ctx, taskId)
  if (!task) throw new ApiError(404, "Task not found", "not_found")
  return json(task)
})

/** PATCH /api/w/[slug]/tasks/[taskId] → TaskDto */
export const PATCH = route<P>(async (req, { params }) => {
  const { slug, taskId } = await params
  const ctx = await requireApiOrg(req, slug)
  assertApiScope(ctx, "tasks.read")
  assertWritable(ctx)
  const input = await parseJson(req, taskInputSchema.partial())
  return json(await updateTask(ctx, taskId, input))
})

/** DELETE /api/w/[slug]/tasks/[taskId] */
export const DELETE = route<P>(async (req, { params }) => {
  const { slug, taskId } = await params
  const ctx = await requireApiOrg(req, slug)
  assertApiScope(ctx, "tasks.read")
  assertWritable(ctx)
  await deleteTask(ctx, taskId)
  return json({ ok: true })
})
