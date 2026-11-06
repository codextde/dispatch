import "server-only"
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { ApiError, type ApiContext } from "@/server/api"
import { getAccountAccess, getConversationAccess, visibleConversationIds } from "@/server/access"
import { Temporal } from "@js-temporal/polyfill"
import { listTasks } from "@/server/tasks"
import { audit } from "@/server/audit"
import { encryptJson } from "@/server/crypto"
import { publish } from "@/server/realtime"
import type { CalendarEntry, CalendarSource } from "@/lib/calendar"
import { prepareCalendarNotice, queueCalendarMail, setOrganizer } from "./invitations"
import { discoverAruba, writeArubaEvent } from "./aruba"
import { calendarCredentials, syncArubaCalendar, type CalendarRow } from "./sync"
import { eventSchema, occurrenceFields, occurrences, parseCalendar, writeEvent, zoneSchema } from "./ical"

const { calendars, calendarEvents, accounts } = schema
const uuid = z.uuid()
const name = z.string().trim().min(1).max(160)
const credentials = { accountId: uuid, password: z.string().min(1).max(1000) }
const occurrence = z.string().regex(/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\dZ?)?$/).optional()
export const calendarQuery = z.object({ from: z.iso.date(), to: z.iso.date(), tz: zoneSchema, conversation: z.uuid().optional() }).refine(
  ({ from, to }) => Date.parse(to) > Date.parse(from) && Date.parse(to) - Date.parse(from) <= 45 * 86_400_000,
  "Choose a calendar interval of up to 45 days.",
)
export const calendarAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createCalendar"), name, shared: z.boolean() }),
  z.object({ action: z.literal("discover"), ...credentials }),
  z.object({ action: z.literal("connect"), ...credentials, paths: z.array(z.string().max(2048)).min(1).max(50), shared: z.boolean() }),
  z.object({ action: z.literal("disconnect"), calendarId: uuid }),
  z.object({ action: z.literal("sync"), calendarId: uuid }),
  z.object({ action: z.literal("save"), calendarId: uuid, id: uuid, version: uuid.optional(), occurrence, fields: eventSchema, conversationId: uuid.optional(), organizerAccountId: uuid.optional() }),
  z.object({ action: z.literal("delete"), calendarId: uuid, id: uuid, version: uuid, occurrence }),
])

async function calendarAccess(ctx: ApiContext) {
  const inboxes = await getAccountAccess(ctx)
  const manage = ctx.permissions.has("calendar.manage")
  const visible = (calendar: CalendarRow) =>
    (calendar.ownerId === null || calendar.ownerId === ctx.user.id) &&
    (!calendar.accountId || inboxes.has(calendar.accountId))
  const writable = (calendar: CalendarRow) =>
    visible(calendar) && !ctx.locked && (!calendar.accountId || inboxes.get(calendar.accountId) !== "read")
  const manageable = (calendar: CalendarRow) => visible(calendar) && !ctx.locked &&
    (calendar.remotePath ? Boolean(calendar.accountId && inboxes.get(calendar.accountId) === "manage") : calendar.ownerId === ctx.user.id || (calendar.ownerId === null && manage))
  const edit = (calendar: CalendarRow, creatorId: string | null) =>
    writable(calendar) && (Boolean(calendar.remotePath || calendar.ownerId) || creatorId === ctx.user.id || manage)
  return { inboxes, visible, writable, manageable, edit }
}

export async function getCalendar(ctx: ApiContext, query: z.infer<typeof calendarQuery>) {
  const orgId = ctx.org.id
  const access = await calendarAccess(ctx)
  const all = await db.select().from(calendars).where(and(eq(calendars.orgId, orgId),
    or(isNull(calendars.ownerId), eq(calendars.ownerId, ctx.user.id)))).orderBy(calendars.name)
  const visible = all.filter(access.visible)
  const byId = new Map(visible.map((calendar) => [calendar.id, calendar]))
  const sources: CalendarSource[] = visible.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    kind: calendar.remotePath ? "aruba" : calendar.ownerId ? "personal" : "shared",
    writable: access.writable(calendar),
    manageable: access.manageable(calendar),
    syncedAt: calendar.syncedAt?.toISOString() ?? null,
    syncError: calendar.syncError,
  }))
  const rows = visible.length ? await db.select().from(calendarEvents)
    .where(and(eq(calendarEvents.orgId, orgId), inArray(calendarEvents.calendarId, [...byId.keys()]))) : []
  const links = await visibleConversationIds(ctx, [...new Set(rows.flatMap((row) => row.conversationId ? [row.conversationId] : []))], [...access.inboxes.keys()])
  const entries: CalendarEntry[] = []
  for (const row of rows) {
    const calendar = byId.get(row.calendarId)!
    try {
      for (const item of occurrences(row.ics, query.from, query.to, query.tz)) {
        entries.push({
          ...item.fields, id: row.id, calendarId: row.calendarId, version: row.version,
          occurrence: item.occurrence, series: item.series, writable: !row.invitationKey && access.edit(calendar, row.creatorId),
          organizerAccountId: row.organizerAccountId, responses: item.responses,
          conversationId: row.conversationId && links.has(row.conversationId) ? row.conversationId : null,
        })
      }
    } catch {
      // Keep the remaining calendar usable when a provider sends malformed iCalendar.
      continue
    }
  }
  const manageable = [...access.inboxes].filter(([, level]) => level === "manage").map(([id]) => id)
  const mailboxes = manageable.length ? await db.select({ id: accounts.id, email: accounts.email, personal: accounts.ownerUserId })
    .from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.provider, "imap"), or(isNull(accounts.ownerUserId), eq(accounts.ownerUserId, ctx.user.id)), inArray(accounts.id, manageable))) : []
  const sendable = [...access.inboxes].filter(([, level]) => level !== "read").map(([id]) => id)
  const senders = sendable.length ? await db.select({ id: accounts.id, email: accounts.email }).from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.status, "active"), ne(accounts.provider, "demo"), inArray(accounts.id, sendable))) : []
  const toInstant = (day: string) => Temporal.PlainDate.from(day).toZonedDateTime(query.tz).toInstant().toString()
  const tasks = ctx.permissions.has("tasks.read") || ctx.permissions.has("tasks.manage")
    ? (await listTasks(ctx, { dueFrom: toInstant(query.from), dueBefore: toInstant(query.to) }))
      .flatMap((task) => task.dueAt ? [{ id: task.id, title: task.title, dueAt: task.dueAt }] : [])
    : []
  const linked = query.conversation ? await getConversationAccess(ctx, query.conversation, access.inboxes) : null
  const draftTitle = linked ? (linked.conversation.customSubject || linked.conversation.subject).slice(0, 300) : null
  return { tasks, senders, sources, draftTitle, entries: entries.sort((a, b) => a.start.localeCompare(b.start)), mailboxes }
}

export async function mutateCalendar(ctx: ApiContext, input: z.infer<typeof calendarAction>) {
  const orgId = ctx.org.id
  const actorId = ctx.user.id
  const access = await calendarAccess(ctx)
  const changed = async (action: string, targetId: string) => {
    await audit({ orgId, actorId, action: "calendar." + action, targetType: "calendar", targetId })
    await publish({ orgId, type: "calendar.updated" })
  }
  if (input.action === "createCalendar") {
    if (input.shared && !ctx.permissions.has("calendar.manage")) throw new ApiError(403, "You cannot create shared calendars")
    const [calendar] = await db.insert(calendars).values({ orgId, ownerId: input.shared ? null : actorId, name: input.name }).returning({ id: calendars.id })
    await changed("created", calendar.id)
    return calendar
  }
  if (input.action === "discover" || input.action === "connect") {
    if (access.inboxes.get(input.accountId) !== "manage") throw new ApiError(403, "You cannot manage this mailbox")
    const [account] = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, input.accountId), eq(accounts.provider, "imap")))
    if (!account || (account.ownerUserId && account.ownerUserId !== actorId)) throw new ApiError(404, "Mailbox not found")
    const credentials = { email: account.email, password: input.password }
    const remote = await discoverAruba(credentials)
    if (input.action === "discover") return { calendars: remote }
    if (input.shared && account.ownerUserId) throw new ApiError(422, "Personal mailbox calendars cannot be shared")
    const wanted = remote.filter((calendar) => input.paths.includes(calendar.path))
    if (wanted.length !== new Set(input.paths).size) throw new ApiError(422, "Select available Aruba calendars")
    const credentialEnc = encryptJson(credentials)
    const linked = await db.transaction(async (tx) => {
      const ids: string[] = []
      for (const calendar of wanted) {
        const [existing] = await tx.select().from(calendars).where(and(eq(calendars.orgId, orgId),
          eq(calendars.accountId, account.id), eq(calendars.remotePath, calendar.path))).for("update")
        if (existing && !access.manageable(existing)) throw new ApiError(409, "This calendar is already linked privately")
        const values = { name: calendar.name, credentialEnc, ownerId: input.shared ? null : actorId, syncedAt: null, syncError: null }
        const [row] = existing
          ? await tx.update(calendars).set(values).where(and(eq(calendars.orgId, orgId), eq(calendars.id, existing.id))).returning({ id: calendars.id })
          : await tx.insert(calendars).values({ ...values, orgId, accountId: account.id, remotePath: calendar.path }).returning({ id: calendars.id })
        ids.push(row.id)
      }
      return ids
    })
    for (const id of linked) await changed("connected", id)
    return { linked }
  }

  if (input.action === "sync") {
    const [calendar] = await db.select().from(calendars).where(and(eq(calendars.orgId, orgId), eq(calendars.id, input.calendarId)))
    if (!calendar?.remotePath || !access.manageable(calendar)) throw new ApiError(404, "Calendar not found")
    await syncArubaCalendar(orgId, calendar.id, true)
    return { id: calendar.id }
  }

  const result = await db.transaction(async (tx) => {
    const [calendar] = await tx.select().from(calendars).where(and(eq(calendars.orgId, orgId), eq(calendars.id, input.calendarId))).for("update")
    if (!calendar || !access.visible(calendar)) throw new ApiError(404, "Calendar not found")
    if (input.action === "disconnect") {
      if (!access.manageable(calendar)) throw new ApiError(403, "You cannot remove this calendar")
      await tx.delete(calendars).where(and(eq(calendars.orgId, orgId), eq(calendars.id, calendar.id)))
      return { id: calendar.id, action: "removed" }
    }
    const where = and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.calendarId, calendar.id), eq(calendarEvents.id, input.id))
    const [existing] = await tx.select().from(calendarEvents).where(where)
    if (existing?.invitationKey) throw new ApiError(403, "Manage this invitation from its email")
    if (!access.edit(calendar, existing ? existing.creatorId : actorId)) throw new ApiError(403, "You cannot modify this event")
    if (input.action === "save" && !input.version && existing?.creatorId === actorId) {
      return { id: existing.id, action: null }
    }
    if (existing?.version !== input.version) throw new ApiError(409, "This event changed. Refresh the calendar and review the current version.", "calendar_conflict")
    if (input.occurrence && !existing) throw new ApiError(404, "Event not found")
    const conversationId = input.action === "save" ? input.conversationId : undefined
    if (conversationId && !(await getConversationAccess(ctx, conversationId, access.inboxes))) throw new ApiError(404, "Conversation not found")
    const remotePath = calendar.remotePath ? existing?.remotePath ?? calendar.remotePath + input.id + ".ics" : null
    if (remotePath && existing && !existing.etag) throw new ApiError(409, "Sync the Aruba calendar before editing this event")
    const organizerId = existing?.organizerAccountId ?? (input.action === "save" ? input.organizerAccountId : undefined)
    const [organizer] = organizerId && !remotePath && access.inboxes.has(organizerId) && access.inboxes.get(organizerId) !== "read"
      ? await tx.select({ id: accounts.id, email: accounts.email }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, organizerId), eq(accounts.status, "active")))
      : []
    if (organizerId && !organizer) throw new ApiError(403, "The organizer mailbox is unavailable")
    const component = existing ? parseCalendar(existing.ics).master : undefined
    const oldTitle = String(component?.getFirstPropertyValue("summary") ?? "Calendar event")
    const oldAttendees = component?.getAllProperties("attendee").map((item) => String(item.getFirstValue()).replace(/^mailto:/i, "")) ?? []
    const notify = async (ics: string, method: "REQUEST" | "CANCEL", attendees: string[], title: string) => {
      if (!organizer) return
      const recipients = [...new Set(attendees)].filter((address) => address.toLowerCase() !== organizer.email.toLowerCase())
      if (recipients.length) await queueCalendarMail(tx, orgId, organizer.id, recipients, title, prepareCalendarNotice(ics, organizer.email, method, input.occurrence), method)
    }
    if (input.action === "delete" && !input.occurrence) {
      if (remotePath) await writeArubaEvent(calendarCredentials(calendar), remotePath, existing!.etag)
      if (organizer) await notify(setOrganizer(existing!.ics, organizer.email), "CANCEL", oldAttendees, oldTitle)
      await tx.delete(calendarEvents).where(where)
      return { id: input.id, action: "event_deleted" }
    }
    const uid = existing ? String(parseCalendar(existing.ics).master.getFirstPropertyValue("uid")) : input.id + "@dispatch"
    const instance = input.occurrence && existing ? occurrenceFields(existing.ics, input.occurrence) : undefined
    if (input.occurrence && !instance) throw new ApiError(404, "Occurrence not found")
    const fields = input.action === "save" ? input.fields : instance
    if (!fields) throw new ApiError(404, "Occurrence not found")
    if (!remotePath && fields.attendees.length && !organizer) throw new ApiError(422, "Select a sender mailbox for invitations")
    const raw = writeEvent(fields, uid, existing?.ics, input.occurrence, input.action === "delete")
    const providerEmail = remotePath && fields.attendees.length ? calendarCredentials(calendar).email : null
    const currentOrganizer = String(component?.getFirstPropertyValue("organizer") ?? "").replace(/^mailto:/i, "")
    const organizerEmail = organizer?.email ?? (providerEmail && (!currentOrganizer || currentOrganizer.toLowerCase() === providerEmail.toLowerCase()) ? providerEmail : null)
    const ics = organizerEmail ? setOrganizer(raw, organizerEmail, input.occurrence) : raw
    if (input.action === "delete") await notify(ics, "CANCEL", fields.attendees, fields.title)
    else {
      await notify(ics, "REQUEST", fields.attendees, fields.title)
      await notify(ics, "CANCEL", oldAttendees.filter((address) => !fields.attendees.includes(address)), fields.title)
    }
    const etag = remotePath ? await writeArubaEvent(calendarCredentials(calendar), remotePath, existing?.etag ?? null, ics) : null
    const values = { ics, remotePath, etag, organizerAccountId: organizer?.id, version: crypto.randomUUID(), conversationId: conversationId ?? existing?.conversationId ?? null }
    if (existing) await tx.update(calendarEvents).set(values).where(where)
    else await tx.insert(calendarEvents).values({ ...values, id: input.id, orgId, calendarId: calendar.id, creatorId: actorId })
    return { id: input.id, action: existing ? "event_updated" : "event_created" }
  }).catch(async (error: unknown) => {
    if (error instanceof ApiError && error.code === "calendar_conflict" && error.message.startsWith("Aruba")) {
      await syncArubaCalendar(orgId, input.calendarId, true)
    }
    throw error
  })
  if (result.action) await changed(result.action, result.id)
  return { id: result.id }
}
