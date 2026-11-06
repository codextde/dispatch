import "server-only"
import { createHash } from "node:crypto"
import ICAL from "ical.js"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, schema, type DbOrTx } from "@/server/db"
import { ApiError, type ApiContext } from "@/server/api"
import { getAccountAccess, getConversationAccess } from "@/server/access"
import { readAttachmentBuffer } from "@/server/mail/remote-attachments"
import { enqueueJob } from "@/server/jobs"
import { publish } from "@/server/realtime"
import { occurrenceFields, parseCalendar, writeEvent } from "./ical"
import { createSmtpTransport } from "@/server/mail/connection"

const { accounts, attachments, messages, calendars, calendarEvents } = schema
export const responseSchema = z.enum(["IMPORT", "ACCEPTED", "TENTATIVE", "DECLINED"])
const email = (value: unknown) => String(value ?? "").replace(/^mailto:/i, "").toLowerCase()
export const isCalendarAttachment = (item: { contentType: string; filename: string }) =>
  item.contentType.split(";")[0] === "text/calendar" || /\.ics$/i.test(item.filename)

function parseInvite(ics: string, sender: string, mailbox: string, accountId: string) {
  try {
    const source = new ICAL.Component(ICAL.parse(ics))
    const method = String(source.getFirstPropertyValue("method") ?? "").toUpperCase()
    const event = source.getFirstSubcomponent("vevent")
    const organizer = email(event?.getFirstPropertyValue("organizer"))
    const uid = String(event?.getFirstPropertyValue("uid") ?? "")
    if (!event || !uid || !["REQUEST", "CANCEL", ""].includes(method)) return null
    if (method && (organizer !== email(sender) || !z.email().safeParse(organizer).success ||
      !event.getAllProperties("attendee").some((attendee) => email(attendee.getFirstValue()) === email(mailbox)))) return null
    const recurrence = String(event.getFirstPropertyValue("recurrence-id") ?? "")
    const sequence = Number(event.getFirstPropertyValue("sequence")) || 0
    const timestamp = event.getFirstPropertyValue("dtstamp")
    const stamp = timestamp instanceof ICAL.Time ? timestamp.toUnixTime() : 0
    const key = createHash("sha256").update(JSON.stringify([accountId, organizer || email(sender), uid])).digest("hex")
    return { source, event, key, method, organizer, recurrence, sequence, stamp }
  } catch {
    return null
  }
}

type Invite = NonNullable<ReturnType<typeof parseInvite>>
type InvitationRow = typeof calendarEvents.$inferSelect

function applyInvite(invite: Invite, row?: InvitationRow) {
  const versions = { ...row?.invitationVersions }
  const key = invite.recurrence || "series"
  const previous = versions[key]
  if (previous && (previous.sequence > invite.sequence ||
    (previous.sequence === invite.sequence && previous.stamp >= invite.stamp))) return null
  if (!row && (invite.recurrence || invite.method === "CANCEL" || !invite.event.hasProperty("dtstart"))) return null
  const calendar = row ? new ICAL.Component(ICAL.parse(row.ics)) : new ICAL.Component("vcalendar")
  if (!row) {
    calendar.addPropertyWithValue("version", "2.0")
    calendar.addPropertyWithValue("prodid", "-//Dispatch//Calendar//EN")
  }
  for (const zone of invite.source.getAllSubcomponents("vtimezone")) {
    if (!calendar.getAllSubcomponents("vtimezone").some((old) => old.getFirstPropertyValue("tzid") === zone.getFirstPropertyValue("tzid"))) calendar.addSubcomponent(zone)
  }
  const old = calendar.getAllSubcomponents("vevent").find((event) => String(event.getFirstPropertyValue("recurrence-id") ?? "") === invite.recurrence)
  let event = new ICAL.Component(JSON.parse(JSON.stringify(invite.event.toJSON())))
  if (invite.method === "CANCEL") {
    const master = old ?? calendar.getAllSubcomponents("vevent").find((item) => !item.hasProperty("recurrence-id"))
    if (!master) return null
    event = new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())))
    if (!old && invite.recurrence) {
      for (const property of ["rrule", "rdate", "exdate"]) event.removeAllProperties(property)
      const recurrence = invite.event.getFirstProperty("recurrence-id")!
      event.removeAllProperties("recurrence-id")
      event.addProperty(recurrence)
      if (invite.event.hasProperty("dtstart")) event.updatePropertyWithValue("dtstart", invite.event.getFirstPropertyValue("dtstart"))
    }
    event.updatePropertyWithValue("status", "CANCELLED")
  }
  if (old) calendar.removeSubcomponent(old)
  calendar.addSubcomponent(event)
  versions[key] = { sequence: invite.sequence, stamp: invite.stamp }
  return { ics: calendar.toString() + "\r\n", invitationVersions: versions, version: crypto.randomUUID() }
}

async function loadAttachment(orgId: string, attachmentId: string) {
  const [row] = await db.select({ attachment: attachments, message: messages, account: accounts })
    .from(attachments).innerJoin(messages, and(eq(messages.orgId, orgId), eq(messages.id, attachments.messageId)))
    .innerJoin(accounts, and(eq(accounts.orgId, orgId), eq(accounts.id, messages.accountId)))
    .where(and(eq(attachments.orgId, orgId), eq(attachments.id, attachmentId), eq(messages.direction, "inbound")))
  if (!row || !isCalendarAttachment(row.attachment) || row.attachment.size > 1_000_000) return null
  return row
}

async function readInvite(row: NonNullable<Awaited<ReturnType<typeof loadAttachment>>>) {
  const content = await readAttachmentBuffer(row.attachment)
  if (!content) throw new Error("Unable to read invitation attachment")
  return parseInvite(content.toString("utf8"), row.message.fromEmail, row.account.email, row.account.id)
}

export async function invitation(ctx: ApiContext, attachmentId: string, response?: z.infer<typeof responseSchema>) {
  const orgId = ctx.org.id
  const row = await loadAttachment(orgId, attachmentId)
  if (!row) throw new ApiError(404, "Calendar invitation not found")
  const access = await getAccountAccess(ctx)
  if (!access.has(row.account.id) || !(await getConversationAccess(ctx, row.message.conversationId, access))) throw new ApiError(404, "Calendar invitation not found")
  const invite = await readInvite(row)
  if (!invite) throw new ApiError(422, "This attachment is not a supported calendar invitation")
  const title = String(invite.event.getFirstPropertyValue("summary") ?? "").slice(0, 300)
  const replyable = invite.method === "REQUEST" && access.get(row.account.id) !== "read"
  if (!response) return { title, replyable, cancelled: invite.method === "CANCEL" }
  if (invite.method === "CANCEL" || (response !== "IMPORT" && !replyable)) throw new ApiError(403, "This invitation cannot be answered")
  const me = ctx.user.id
  await db.transaction(async (tx) => {
    await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, row.account.id))).for("update")
    const [existing] = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.invitationKey, invite.key), eq(calendarEvents.creatorId, me))).for("update")
    const patch = applyInvite(invite, existing)
    if (!existing && !patch) throw new ApiError(422, "Import the original invitation before handling this occurrence")
    const key = invite.recurrence || "series"
    const current = existing?.invitationVersions?.[key]
    if (!patch && current && (current.sequence !== invite.sequence || current.stamp !== invite.stamp)) throw new ApiError(409, "Open the latest version of this invitation")
    if (existing && patch) await tx.update(calendarEvents).set(patch).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, existing.id)))
    if (response !== "IMPORT" && (patch || current?.response !== response)) {
      const versions = patch?.invitationVersions ?? { ...existing?.invitationVersions }
      versions[key] = { sequence: invite.sequence, stamp: invite.stamp, response }
      if (patch) patch.invitationVersions = versions
      if (existing) await tx.update(calendarEvents).set({ invitationVersions: versions }).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, existing.id)))
      const calendar = new ICAL.Component("vcalendar")
      calendar.addPropertyWithValue("version", "2.0")
      calendar.addPropertyWithValue("prodid", "-//Dispatch//Calendar//EN")
      calendar.addPropertyWithValue("method", "REPLY")
      const event = new ICAL.Component("vevent")
      for (const field of ["uid", "organizer", "sequence", "recurrence-id", "dtstart"]) {
        const prop = invite.event.getFirstProperty(field)
        if (prop) event.addProperty(new ICAL.Property(JSON.parse(JSON.stringify(prop.toJSON()))))
      }
      for (const zone of invite.source.getAllSubcomponents("vtimezone")) calendar.addSubcomponent(zone)
      event.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true))
      const attendee = new ICAL.Property("attendee")
      attendee.setValue("mailto:" + row.account.email)
      attendee.setParameter("partstat", response)
      event.addProperty(attendee)
      calendar.addSubcomponent(event)
      await queueCalendarMail(tx, orgId, row.account.id, [invite.organizer], title, calendar.toString(), "REPLY")
    }
    if (!existing && patch) {
      const calendarId = await invitationCalendar(tx, orgId, me, row.account.id)
      await tx.insert(calendarEvents).values({ ...patch, orgId, calendarId, creatorId: me, conversationId: row.message.conversationId, invitationKey: invite.key })
    }
  })
  await publish({ orgId, type: "calendar.updated", userIds: [me] })
  return { title }
}

async function invitationCalendar(tx: DbOrTx, orgId: string, userId: string, accountId: string) {
  const name = "Invitations"
  const [existing] = await tx.select({ id: calendars.id }).from(calendars).where(and(eq(calendars.orgId, orgId), eq(calendars.ownerId, userId), eq(calendars.accountId, accountId), eq(calendars.name, name)))
  if (existing) return existing.id
  const [calendar] = await tx.insert(calendars).values({ name, orgId, ownerId: userId, accountId }).returning({ id: calendars.id })
  return calendar.id
}

export async function handleInvitationUpdate(payload: Record<string, unknown>) {
  if (typeof payload.orgId !== "string" || typeof payload.attachmentId !== "string") return
  const orgId = payload.orgId
  const row = await loadAttachment(orgId, payload.attachmentId)
  if (!row) return
  const content = await readAttachmentBuffer(row.attachment)
  if (!content) throw new Error("Unable to read invitation attachment")
  const text = content.toString("utf8")
  if (await applyCalendarReply(orgId, row.account, row.message.fromEmail, text)) return
  const invite = parseInvite(text, row.message.fromEmail, row.account.email, row.account.id)
  if (!invite?.method) return
  const changed = await db.transaction(async (tx) => {
    const entries = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.invitationKey, invite.key))).for("update")
    const recipients: string[] = []
    for (const entry of entries) {
      const patch = applyInvite(invite, entry)
      if (!patch || !entry.creatorId) continue
      await tx.update(calendarEvents).set(patch).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, entry.id)))
      recipients.push(entry.creatorId)
    }
    return recipients
  })
  if (changed.length) await publish({ orgId, type: "calendar.updated", userIds: changed })
}

export async function queueCalendarMail(tx: DbOrTx, orgId: string, accountId: string, recipients: string[], title: string, ics: string, method: string) {
  await enqueueJob("calendar.mail", { orgId, accountId, recipients, title, ics, method }, { tx, maxAttempts: 1 })
}

export async function handleCalendarMail(payload: Record<string, unknown>, job: { id: string }) {
  const parsed = z.object({ orgId: z.uuid(), accountId: z.uuid(), recipients: z.array(z.email()).min(1).max(50),
    title: z.string(), ics: z.string(), method: z.enum(["REQUEST", "CANCEL", "REPLY"]) }).parse(payload)
  const [account] = await db.select().from(accounts).where(and(eq(accounts.orgId, parsed.orgId), eq(accounts.id, parsed.accountId)))
  if (!account || account.status !== "active") throw new Error("Calendar sender mailbox is unavailable")
  const transport = await createSmtpTransport(account)
  try {
    await transport.sendMail({
      from: account.email, to: parsed.recipients, subject: parsed.title,
      text: parsed.title, messageId: "<calendar-" + job.id + "@dispatch>",
      icalEvent: { method: parsed.method, content: parsed.ics },
    })
  } finally {
    transport.close()
  }
}

export function prepareCalendarNotice(ics: string, organizer: string, method: "REQUEST" | "CANCEL", occurrence?: string) {
  const calendar = new ICAL.Component(ICAL.parse(ics))
  calendar.updatePropertyWithValue("method", method)
  for (const event of calendar.getAllSubcomponents("vevent")) {
    const id = String(event.getFirstPropertyValue("recurrence-id") ?? "")
    if (occurrence && id !== occurrence) { calendar.removeSubcomponent(event); continue }
    event.updatePropertyWithValue("organizer", "mailto:" + organizer)
    event.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true))
    if (method === "CANCEL") event.updatePropertyWithValue("status", "CANCELLED")
  }
  return calendar.toString() + "\r\n"
}

export function setOrganizer(ics: string, organizer: string, occurrence?: string) {
  const calendar = new ICAL.Component(ICAL.parse(ics))
  const master = calendar.getAllSubcomponents("vevent").find((event) => !event.hasProperty("recurrence-id"))
  const target = occurrence
    ? calendar.getAllSubcomponents("vevent").find((event) => String(event.getFirstPropertyValue("recurrence-id")) === occurrence)
    : master
  if (target) {
    const prior = Number(target.getFirstPropertyValue("sequence") ?? 0)
    const sequence = Math.max(prior, Number(master?.getFirstPropertyValue("sequence") ?? 0)) + 1
    target.updatePropertyWithValue("organizer", "mailto:" + organizer)
    target.updatePropertyWithValue("sequence", sequence)
  }
  return calendar.toString() + "\r\n"
}

async function applyCalendarReply(orgId: string, account: typeof accounts.$inferSelect, sender: string, text: string) {
  let reply: ICAL.Component
  try {
    const calendar = new ICAL.Component(ICAL.parse(text))
    if (String(calendar.getFirstPropertyValue("method")).toUpperCase() !== "REPLY") return false
    const component = calendar.getFirstSubcomponent("vevent")
    if (!component) return true
    reply = component
  } catch {
    return false
  }
  const uid = String(reply.getFirstPropertyValue("uid") ?? "")
  const id = uid.endsWith("@dispatch") ? z.uuid().safeParse(uid.slice(0, -"@dispatch".length)) : null
  if (!id?.success || email(reply.getFirstPropertyValue("organizer")) !== email(account.email)) return true
  const attendee = reply.getAllProperties("attendee").find((property) => email(property.getFirstValue()) === email(sender))
  const status = String(attendee?.getParameter("partstat") ?? "").toUpperCase()
  if (!attendee || !["ACCEPTED", "TENTATIVE", "DECLINED"].includes(status)) return true
  const recurrence = String(reply.getFirstPropertyValue("recurrence-id") ?? "")
  const updated = await db.transaction(async (tx) => {
    const where = and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, id.data), eq(calendarEvents.organizerAccountId, account.id))
    const [row] = await tx.select().from(calendarEvents).where(where).for("update")
    if (!row) return false
    let parsed = parseCalendar(row.ics)
    if (parsed.master.getFirstPropertyValue("status") === "CANCELLED") return false
    const find = () => parsed.calendar.getAllSubcomponents("vevent")
      .find((event) => String(event.getFirstPropertyValue("recurrence-id") ?? "") === recurrence)
    let event = find()
    if (!event && recurrence) {
      const fields = occurrenceFields(row.ics, recurrence)
      if (!fields) return false
      parsed = parseCalendar(writeEvent(fields, uid, row.ics, recurrence))
      event = find()
    }
    if (!event || event.getFirstPropertyValue("status") === "CANCELLED" ||
      Number(reply.getFirstPropertyValue("sequence") ?? 0) !== Number(event.getFirstPropertyValue("sequence") ?? 0)) return false
    const saved = event.getAllProperties("attendee").find((property) => email(property.getFirstValue()) === email(sender))
    if (!saved || saved.getParameter("partstat") === status) return false
    const stamp = reply.getFirstPropertyValue("dtstamp")
    if (stamp instanceof ICAL.Time) {
      const last = Number(saved.getParameter("x-dispatch-reply-stamp") ?? 0)
      if (stamp.toUnixTime() < last) return false
      saved.setParameter("x-dispatch-reply-stamp", String(stamp.toUnixTime()))
    }
    saved.setParameter("partstat", status)
    await tx.update(calendarEvents).set({ ics: parsed.calendar.toString() + "\r\n", version: crypto.randomUUID() }).where(where)
    return true
  })
  if (updated) await publish({ orgId, type: "calendar.updated" })
  return true
}
