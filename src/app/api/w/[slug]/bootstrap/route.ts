import { json, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { getBootstrap, getBoxCounts } from "@/server/conversations/bootstrap"

/**
 * GET /api/w/[slug]/bootstrap → Bootstrap (members, teams, accounts, labels,
 * signatures, chats, unread counts, inbox settings).
 * GET /api/w/[slug]/bootstrap?only=counts → { counts } (cheap refresh).
 */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  if (req.nextUrl.searchParams.get("only") === "counts") return json({ counts: await getBoxCounts(ctx, scope) })
  return json(await getBootstrap(ctx, scope))
})
