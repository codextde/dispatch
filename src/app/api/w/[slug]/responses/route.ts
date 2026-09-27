import { json, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { listResponses } from "@/server/conversations/feed"

/** GET /api/w/[slug]/responses → { items: CannedResponseItem[] } (personal, team and workspace responses) */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  return json({ items: await listResponses(ctx, scope) })
})
