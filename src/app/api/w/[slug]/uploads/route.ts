import { ApiError, json, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { storeUpload } from "@/server/conversations/files"
import { getSettings } from "@/server/settings"

/**
 * POST /api/w/[slug]/uploads (multipart/form-data, field "file")
 *   → AttachmentInfo (201). The upload stays unlinked until it is attached to
 *   a draft, message or comment by its id. Size limit: Admin → Storage.
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx } = await inboxContext(req, (await params).slug, { write: true })
  // Never buffer more than one file's worth: the declared length is checked up front and the body is
  // counted while it streams (a chunked upload has no Content-Length). Exact per-file check: storeUpload.
  const storage = await getSettings("storage")
  const maxBytes = storage.maxAttachmentMb * 1024 * 1024 + 64 * 1024
  const tooLarge = () => new ApiError(413, `Files can be at most ${storage.maxAttachmentMb} MB`, "file_too_large")
  if (Number(req.headers.get("content-length") || 0) > maxBytes) throw tooLarge()
  if (!req.body) throw new ApiError(400, "Expected multipart/form-data", "invalid_body")
  let received = 0
  const body = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength
        if (received > maxBytes) controller.error(tooLarge())
        else controller.enqueue(chunk)
      },
    })
  )
  let form: FormData
  try {
    form = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData()
  } catch {
    if (received > maxBytes) throw tooLarge()
    throw new ApiError(400, "Expected multipart/form-data", "invalid_body")
  }
  const file = form.get("file")
  if (!(file instanceof File)) throw new ApiError(400, "Missing file", "missing_file")
  return json(await storeUpload(ctx, file), 201)
})
