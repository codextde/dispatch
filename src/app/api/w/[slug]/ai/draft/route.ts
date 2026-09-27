import { z } from "zod"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { getConversationAccess } from "@/server/access"
import { assertAiAvailable, draftReply, toApiError } from "@/server/ai"

type P = { slug: string }

const body = z.object({
  conversationId: z.uuid(),
  tone: z.enum(["friendly", "formal", "concise"]).optional(),
  instructions: z.string().max(2000).nullish(),
  /** What the agent has typed so far (plain text); the draft builds on it */
  currentDraft: z.string().max(20_000).nullish(),
})

/** POST /api/w/[slug]/ai/draft { conversationId, tone?, instructions?, currentDraft? } → { text, html } */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const input = await parseJson(req, body)
  const access = await getConversationAccess(ctx, input.conversationId)
  if (!access) throw new ApiError(404, "Conversation not found", "not_found")
  if (access.level === "read") throw new ApiError(403, "You can't reply in this conversation", "forbidden")
  await assertAiAvailable(ctx)
  const conv = access.conversation
  try {
    return json(
      await draftReply({
        orgId: ctx.org.id,
        orgName: ctx.org.name,
        agentName: ctx.user.name || ctx.user.email.split("@")[0]!,
        conversation: { id: conv.id, subject: conv.customSubject || conv.subject, participants: conv.participants },
        tone: input.tone,
        instructions: input.instructions,
        currentDraft: input.currentDraft,
      })
    )
  } catch (err) {
    throw toApiError(err)
  }
})
