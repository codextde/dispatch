import { z } from "zod"
import { json, parseQuery, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { listConversations } from "@/server/conversations/queries"

const query = z.object({
  q: z.string().max(500).default(""),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * GET /api/w/[slug]/search?q=from:anna has:attachment invoice&limit=20
 *   → { items: ConversationListItem[], nextCursor }
 * Operators: from: to: subject: label: assignee:(me|email|name) has:attachment
 * is:(unread|read|open|closed|starred|snoozed|assigned|unassigned) in:(trash|spam|anywhere) before: after:
 */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  const { q, cursor, limit } = parseQuery(req, query)
  return json(await listConversations(ctx, scope, { box: { kind: "static", id: "search" }, filters: { q }, cursor, limit }))
})
