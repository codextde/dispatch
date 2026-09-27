import { route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { sendNow } from "@/server/conversations/messages"

/** POST /api/w/[slug]/messages/[id]/send — send a scheduled/queued message now → 204 */
export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  await sendNow(ctx, scope, assertUuid(id, "Message"))
  return new Response(null, { status: 204 })
})
