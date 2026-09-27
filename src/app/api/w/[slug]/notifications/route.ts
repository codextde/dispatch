import { z } from "zod"
import { json, parseJson, parseQuery, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { listNotifications, markNotifications } from "@/server/conversations/feed"

/** GET /api/w/[slug]/notifications?cursor=&limit=30&unread=1 → NotificationPage */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const q = parseQuery(
    req,
    z.object({ cursor: z.string().max(64).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), unread: z.enum(["1", "0"]).optional() })
  )
  return json(await listNotifications(ctx, { cursor: q.cursor, limit: q.limit, unreadOnly: q.unread === "1" }))
})

/** POST /api/w/[slug]/notifications { ids?: uuid[], all?: true, read?: boolean = true } → { updated } */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertWritable(ctx)
  const input = await parseJson(
    req,
    z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional(), read: z.boolean().default(true) })
  )
  return json(await markNotifications(ctx, input))
})
