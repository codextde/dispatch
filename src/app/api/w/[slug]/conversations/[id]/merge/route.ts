import { z } from "zod"
import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { mergeConversations } from "@/server/conversations/mutations"

/** POST /api/w/[slug]/conversations/[id]/merge { targetId } → merges [id] into targetId */
export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const { targetId } = await parseJson(req, z.object({ targetId: z.uuid() }))
  return json(await mergeConversations(ctx, scope, targetId, [assertUuid(id, "Conversation")]))
})
