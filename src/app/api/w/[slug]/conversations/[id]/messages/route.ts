import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { sendMessage, sendSchema } from "@/server/conversations/messages"

/**
 * POST /api/w/[slug]/conversations/[id]/messages — reply / reply all / forward.
 * Body: { mode, replyToMessageId?, draftId?, accountId, fromEmail, to, cc, bcc,
 * subject?, html, attachmentIds, sendAt?, closeAfter? } → SendResult (201)
 */
export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const input = await parseJson(req, sendSchema)
  const mode = input.mode === "new" ? "reply" : input.mode
  return json(await sendMessage(ctx, scope, { ...input, mode, conversationId: assertUuid(id, "Conversation") }), 201)
})
