import { ApiError, json, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { compactMessageAttachments, compactMessageHtml, getMessageBody } from "@/server/conversations/messages"
import { rateLimit } from "@/server/rate-limit"

/**
 * GET /api/w/[slug]/messages/[id]?images=1 → MessageBody { html, hasRemoteImages, imagesLoaded }
 * Sanitized HTML for the sandboxed iframe. Remote images are blocked unless
 * `images=1` (and the instance policy allows it).
 */
export const GET = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug)
  const body = await getMessageBody(ctx, scope, assertUuid(id, "Message"), req.nextUrl.searchParams.get("images") === "1")
  return json(body, { headers: { "Cache-Control": body.remoteHtmlUnavailable ? "private, no-store" : "private, max-age=300" } })
})

export const POST = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const limit = await rateLimit(`mail-release-html:${ctx.org.id}:${ctx.user.id}`, 10, 60)
  if (!limit.ok) throw new ApiError(429, "Too many requests. Try again shortly.", "rate_limited")
  const messageId = assertUuid(id, "Message")
  if (req.nextUrl.searchParams.get("attachments") === "1") await compactMessageAttachments(ctx, scope, messageId)
  else await compactMessageHtml(ctx, scope, messageId)
  return new Response(null, { status: 204 })
})
