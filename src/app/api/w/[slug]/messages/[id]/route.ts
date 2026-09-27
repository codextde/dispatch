import { json, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { getMessageBody } from "@/server/conversations/messages"

/**
 * GET /api/w/[slug]/messages/[id]?images=1 → MessageBody { html, hasRemoteImages, imagesLoaded }
 * Sanitized HTML for the sandboxed iframe. Remote images are blocked unless
 * `images=1` (and the instance policy allows it).
 */
export const GET = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug)
  const body = await getMessageBody(ctx, scope, assertUuid(id, "Message"), req.nextUrl.searchParams.get("images") === "1")
  return json(body, { headers: { "Cache-Control": "private, max-age=300" } })
})
