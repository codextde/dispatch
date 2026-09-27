import { z } from "zod"
import { json, parseJson, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { applyConversationPatch, conversationPatchSchema, deleteConversations } from "@/server/conversations/mutations"

const bulkSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(500), patch: conversationPatchSchema }),
  z.object({ ids: z.array(z.uuid()).min(1).max(500), action: z.literal("delete") }),
])

/**
 * POST /api/w/[slug]/conversations/bulk
 *   { ids, patch: ConversationPatch } → { updated: string[], skipped: string[] }
 *   { ids, action: "delete" }        → { deleted: string[] }   (trash only)
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const body = await parseJson(req, bulkSchema)
  if ("action" in body) return json(await deleteConversations(ctx, scope, body.ids))
  return json(await applyConversationPatch(ctx, scope, body.ids, body.patch))
})
