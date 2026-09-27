import { json, parseJson, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { draftSchema, saveDraft } from "@/server/conversations/messages"

/**
 * POST /api/w/[slug]/drafts — create a draft.
 * Body: { conversationId? (omit for a new message), mode, replyToMessageId?, accountId?,
 * fromEmail, to, cc, bcc, subject, html, attachmentIds, isShared? } → DraftInfo (201)
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, draftSchema)
  return json(await saveDraft(ctx, scope, null, input), 201)
})
