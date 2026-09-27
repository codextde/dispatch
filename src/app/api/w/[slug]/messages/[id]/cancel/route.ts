import { json, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { cancelSend } from "@/server/conversations/messages"

/** POST /api/w/[slug]/messages/[id]/cancel — undo send / unschedule → DraftInfo (409 if already sending) */
export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  return json(await cancelSend(ctx, scope, assertUuid(id, "Message")))
})
