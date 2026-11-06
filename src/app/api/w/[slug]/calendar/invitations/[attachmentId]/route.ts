import { z } from "zod"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertPermission, assertWritable } from "@/server/authz"
import { assertUuid } from "@/server/conversations/context"
import { invitation, responseSchema } from "@/server/calendar/invitations"

type Params = { slug: string; attachmentId: string }

export const GET = route<Params>(async (req, { params }) => {
  const { slug, attachmentId } = await params
  const ctx = await requireApiOrg(req, slug)
  if (ctx.via !== "session") throw new ApiError(403, "Calendar requires a workspace session")
  assertPermission(ctx, "calendar.use")
  return json(await invitation(ctx, assertUuid(attachmentId)))
})

export const POST = route<Params>(async (req, { params }) => {
  const { slug, attachmentId } = await params
  const ctx = await requireApiOrg(req, slug)
  if (ctx.via !== "session") throw new ApiError(403, "Calendar requires a workspace session")
  assertPermission(ctx, "calendar.use")
  assertWritable(ctx)
  const { response } = await parseJson(req, z.object({ response: responseSchema }))
  return json(await invitation(ctx, assertUuid(attachmentId), response))
})
