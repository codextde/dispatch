import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { updateChat, updateChatSchema } from "@/server/conversations/chats"

/** PATCH /api/w/[slug]/chats/[id] { name?, addMemberIds?, removeMemberIds?, leave? } → { id, memberIds, name } */
export const PATCH = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx } = await inboxContext(req, slug, { write: true })
  const input = await parseJson(req, updateChatSchema)
  return json(await updateChat(ctx, assertUuid(id, "Chat"), input))
})
