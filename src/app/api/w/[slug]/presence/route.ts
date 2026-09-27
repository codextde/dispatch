import { z } from "zod"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { getViewers, publish, touchPresence } from "@/server/realtime"
import { loadOneAccessible, loadScope } from "@/server/conversations/scope"

const presenceSchema = z.object({
  conversationId: z.uuid().nullable(),
  composing: z.enum(["comment", "reply"]).nullish(),
  /** Conversation the user just left (to update its viewers right away) */
  left: z.uuid().nullish(),
})

const normalize = (v: boolean | "comment" | "reply") => (v === true ? "reply" : v || null)

/**
 * POST /api/w/[slug]/presence { conversationId, composing?, left? }
 *   → { viewers: { userId, composing }[] }
 * Clients call this every ~15s while a conversation is open and whenever the
 * composing state changes. Publishes "presence" (viewers changed) and
 * "typing" (composing changed) events.
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const input = await parseJson(req, presenceSchema)
  const orgId = ctx.org.id
  const me = ctx.user.id

  // Leaving: only if my presence still points at that conversation (requests can arrive out of order).
  if (input.left && input.left !== input.conversationId && getViewers(orgId, input.left).some((v) => v.userId === me)) {
    touchPresence(orgId, me, "", false)
    await publish({ orgId, type: "presence", conversationId: input.left, actorId: me, data: { viewers: getViewers(orgId, input.left).map((v) => ({ userId: v.userId, composing: normalize(v.composing) })) } })
  }
  if (!input.conversationId) return json({ viewers: [] })

  const scope = await loadScope(ctx)
  const row = await loadOneAccessible(ctx, scope, input.conversationId)
  if (!row) throw new ApiError(404, "Conversation not found", "not_found")

  const before = getViewers(orgId, input.conversationId).find((v) => v.userId === me)
  const composing = input.composing ?? null
  const viewers = touchPresence(orgId, me, input.conversationId, composing ?? false).map((v) => ({ userId: v.userId, composing: normalize(v.composing) }))
  const wasComposing = before ? normalize(before.composing) : null
  if (!before || wasComposing !== composing) {
    await publish({ orgId, type: "presence", conversationId: input.conversationId, actorId: me, data: { viewers } })
  }
  if (wasComposing !== composing) {
    await publish({ orgId, type: "typing", conversationId: input.conversationId, actorId: me, data: { userId: me, composing } })
  }
  return json({ viewers })
})
