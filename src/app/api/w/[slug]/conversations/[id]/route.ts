import { ApiError, json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { getListItem, getThread } from "@/server/conversations/queries"
import { applyConversationPatch, conversationPatchSchema, deleteConversations } from "@/server/conversations/mutations"

type P = { slug: string; id: string }

/** GET /api/w/[slug]/conversations/[id] → ConversationThread */
export const GET = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug)
  const thread = await getThread(ctx, scope, assertUuid(id, "Conversation"))
  if (!thread) throw new ApiError(404, "Conversation not found", "not_found")
  return json(thread)
})

/**
 * PATCH /api/w/[slug]/conversations/[id]  body: ConversationPatch
 *   → { item: ConversationListItem | null } (null when the change removed your access, e.g. unassigning yourself)
 */
export const PATCH = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const patch = await parseJson(req, conversationPatchSchema)
  await applyConversationPatch(ctx, scope, [assertUuid(id, "Conversation")], patch)
  return json({ item: await getListItem(ctx, scope, id) })
})

/** DELETE /api/w/[slug]/conversations/[id] → permanently delete (must be in trash) */
export const DELETE = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  return json(await deleteConversations(ctx, scope, [assertUuid(id, "Conversation")]))
})
