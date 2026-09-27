import { z } from "zod"
import { ApiError, json, parseJson, parseQuery, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { listConversations } from "@/server/conversations/queries"
import { sendMessage, sendSchema } from "@/server/conversations/messages"
import { db, schema } from "@/server/db"
import { and, eq, or } from "drizzle-orm"
import { parseBox } from "@/lib/inbox/boxes"

const listQuery = z.object({
  box: z.string().default("inbox"),
  status: z.enum(["open", "closed", "all"]).optional(),
  unread: z.enum(["1", "0", "true", "false"]).optional(),
  assignee: z.enum(["anyone", "me", "none", "others"]).optional(),
  sort: z.enum(["newest", "oldest"]).optional(),
  q: z.string().max(500).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/**
 * GET /api/w/[slug]/conversations?box=inbox&status=open&unread=1&assignee=me&sort=newest&q=&cursor=&limit=50
 *   → { items: ConversationListItem[], nextCursor }
 */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  const q = parseQuery(req, listQuery)
  const box = parseBox(q.box)
  if (!box) throw new ApiError(400, "Unknown mailbox", "invalid_box")
  if (box.kind === "team") {
    const team = await db.query.teams.findFirst({ where: and(eq(schema.teams.id, box.id), eq(schema.teams.orgId, ctx.org.id)), columns: { id: true } })
    if (!team) throw new ApiError(404, "Team not found", "not_found")
  }
  if (box.kind === "account" && !scope.access.has(box.id)) throw new ApiError(404, "Inbox not found", "not_found")
  if (box.kind === "label") {
    const label = await db.query.labels.findFirst({
      where: and(
        eq(schema.labels.id, box.id),
        eq(schema.labels.orgId, ctx.org.id),
        or(eq(schema.labels.visibility, "shared"), eq(schema.labels.ownerUserId, ctx.user.id))
      ),
      columns: { id: true },
    })
    if (!label) throw new ApiError(404, "Label not found", "not_found")
  }
  const page = await listConversations(ctx, scope, {
    box,
    filters: { status: q.status, unread: q.unread === "1" || q.unread === "true", assignee: q.assignee, sort: q.sort, q: q.q },
    cursor: q.cursor,
    limit: q.limit,
  })
  return json(page)
})

/**
 * POST /api/w/[slug]/conversations — compose a new email conversation.
 * Body: SendInput (mode "new"; accountId, fromEmail, to/cc/bcc, subject, html,
 * attachmentIds, draftId?, sendAt?) → SendResult (201)
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, sendSchema)
  const result = await sendMessage(ctx, scope, { ...input, mode: "new", conversationId: input.draftId ? undefined : null })
  return json(result, 201)
})
