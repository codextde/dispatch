import { json, parseJson, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { reactionSchema, toggleReaction } from "@/server/conversations/comments"

/** POST /api/w/[slug]/reactions { commentId, emoji } → { active } (toggles my reaction) */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const { commentId, emoji } = await parseJson(req, reactionSchema)
  return json(await toggleReaction(ctx, scope, commentId, emoji))
})
