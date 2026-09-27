import { ApiError, json, route } from "@/server/api"
import { inboxContext } from "@/server/conversations/context"
import { storeUpload } from "@/server/conversations/files"

/**
 * POST /api/w/[slug]/uploads (multipart/form-data, field "file")
 *   → AttachmentInfo (201). The upload stays unlinked until it is attached to
 *   a draft, message or comment by its id. Size limit: Admin → Storage.
 */
export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx } = await inboxContext(req, (await params).slug, { write: true })
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiError(400, "Expected multipart/form-data", "invalid_body")
  }
  const file = form.get("file")
  if (!(file instanceof File)) throw new ApiError(400, "Missing file", "missing_file")
  return json(await storeUpload(ctx, file), 201)
})
