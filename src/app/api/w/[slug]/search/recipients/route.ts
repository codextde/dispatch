import { z } from "zod"
import { json, parseQuery, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { searchRecipients } from "@/server/conversations/feed"

/** GET /api/w/[slug]/search/recipients?q=ann → { items: RecipientSuggestion[] } (contacts + past participants) */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  const { q, limit } = parseQuery(req, z.object({ q: z.string().max(100).default(""), limit: z.coerce.number().int().min(1).max(20).default(8) }))
  return json({ items: await searchRecipients(ctx, scope, q, limit) })
})
