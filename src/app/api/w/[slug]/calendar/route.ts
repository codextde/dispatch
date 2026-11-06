import { ApiError, json, parseJson, parseQuery, requireApiOrg, route } from "@/server/api"
import { assertPermission, assertWritable } from "@/server/authz"
import { calendarAction, calendarQuery, getCalendar, mutateCalendar } from "@/server/calendar/service"

type Params = { slug: string }

export const GET = route<Params>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  if (ctx.via !== "session") throw new ApiError(403, "Calendar requires a workspace session")
  assertPermission(ctx, "calendar.use")
  return json(await getCalendar(ctx, parseQuery(req, calendarQuery)))
})

export const POST = route<Params>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  if (ctx.via !== "session") throw new ApiError(403, "Calendar requires a workspace session")
  assertPermission(ctx, "calendar.use")
  assertWritable(ctx)
  return json(await mutateCalendar(ctx, await parseJson(req, calendarAction)))
})
