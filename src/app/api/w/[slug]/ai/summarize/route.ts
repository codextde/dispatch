import { z } from "zod"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertApiScope } from "@/server/conversations/context"
import { getConversationAccess } from "@/server/access"
import { assertAiAvailable, cachedSummary, storeSummary, summarizeConversation, toApiError } from "@/server/ai"

type P = { slug: string }

const body = z.object({ conversationId: z.uuid(), refresh: z.boolean().optional() })

/** POST /api/w/[slug]/ai/summarize { conversationId, refresh? } → { summary, cached } */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertApiScope(ctx, "conversations.read")
  const { conversationId, refresh } = await parseJson(req, body)
  const access = await getConversationAccess(ctx, conversationId)
  if (!access) throw new ApiError(404, "Conversation not found", "not_found")
  const conv = access.conversation
  const key = `${ctx.org.id}:${conv.id}:${conv.lastActivityAt.getTime()}`
  const hit = refresh ? null : cachedSummary(key)
  // Cached summaries are still subject to the workspace lock and AI being enabled (but not the rate limit)
  await assertAiAvailable(ctx, { rateLimit: !hit })
  if (hit) return json({ summary: hit, cached: true })

  try {
    const summary = await summarizeConversation(ctx.org.id, { id: conv.id, subject: conv.customSubject || conv.subject })
    storeSummary(key, summary)
    return json({ summary, cached: false })
  } catch (err) {
    throw toApiError(err)
  }
})
