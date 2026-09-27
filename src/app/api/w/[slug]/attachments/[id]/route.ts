import { ApiError, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { INLINE_TYPES, getAuthorizedAttachment } from "@/server/conversations/files"
import { getObject } from "@/server/storage"

/**
 * GET /api/w/[slug]/attachments/[id][?inline=1] — stream an attachment.
 * Always `Content-Disposition: attachment`, except raster images and PDFs
 * with `?inline=1`. Responses are sandboxed (CSP, see next.config.ts) and never sniffed.
 */
export const GET = route<{ slug: string; id: string }>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug)
  const att = await getAuthorizedAttachment(ctx, scope, assertUuid(id, "Attachment"))
  const body = await getObject(att.storageKey)
  if (!body) throw new ApiError(404, "The file is no longer available", "not_found")

  const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.has(att.contentType)
  const encoded = encodeURIComponent(att.filename).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
  const ascii = att.filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return new Response(body, {
    headers: {
      "Content-Type": inline ? att.contentType : "application/octet-stream",
      ...(att.size ? { "Content-Length": String(att.size) } : {}),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      // The sandbox CSP for this path is set in next.config.ts (config headers win over handler headers).
      "Cache-Control": "private, max-age=3600",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
})
