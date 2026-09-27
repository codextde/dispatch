import { z } from "zod"
import { json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { reorderTasks } from "@/server/tasks"

type P = { slug: string }

const body = z.object({
  status: z.enum(["todo", "in_progress", "done"]),
  ids: z.array(z.uuid()).max(1000),
})

/** POST /api/w/[slug]/tasks/reorder { status, ids } — persist a board column's order (and moves between columns). */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertWritable(ctx)
  const { status, ids } = await parseJson(req, body)
  await reorderTasks(ctx, status, ids)
  return json({ ok: true })
})
