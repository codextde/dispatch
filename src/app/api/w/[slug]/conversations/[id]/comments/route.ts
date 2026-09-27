import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { createComment, createCommentSchema } from "@/server/conversations/comments"

/**
 * POST /api/w/[slug]/conversations/[id]/comments
 *   { body: html, attachmentIds?: uuid[], parentId?: uuid } → ThreadComment (201)
 * Mentions (`<span data-type="mention" data-id="…">`) notify & follow.
 */
export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const input = await parseJson(req, createCommentSchema)
  return json(await createComment(ctx, scope, assertUuid(id, "Conversation"), input), 201)
})
