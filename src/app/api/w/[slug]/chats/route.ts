import { json, parseJson, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { listChats } from "@/server/conversations/bootstrap"
import { createChat, createChatSchema } from "@/server/conversations/chats"

/** GET /api/w/[slug]/chats → { items: ChatSummary[] } */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx } = await inboxContext(req, (await params).slug)
  return json({ items: await listChats(ctx) })
})

/**
 * POST /api/w/[slug]/chats { name?, memberIds } → { id, created }
 * Two members without a name = direct message (reused if it exists).
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, createChatSchema)
  const result = await createChat(ctx, input)
  return json(result, result.created ? 201 : 200)
})
