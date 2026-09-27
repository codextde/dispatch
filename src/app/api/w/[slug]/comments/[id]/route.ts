import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { deleteComment, updateComment, updateCommentSchema } from "@/server/conversations/comments"

type P = { slug: string; id: string }

/** PATCH /api/w/[slug]/comments/[id] { body } → { id, body, mentions } (own comments only) */
export const PATCH = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const { body } = await parseJson(req, updateCommentSchema)
  return json(await updateComment(ctx, scope, assertUuid(id, "Comment"), body))
})

/** DELETE /api/w/[slug]/comments/[id] → 204 (soft delete, own comments only) */
export const DELETE = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  await deleteComment(ctx, scope, assertUuid(id, "Comment"))
  return new Response(null, { status: 204 })
})
