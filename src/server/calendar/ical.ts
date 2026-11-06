import ICAL from "ical.js"
import { Temporal } from "@js-temporal/polyfill"
import { z } from "zod"
import type { EventFields } from "@/lib/calendar"

export const zoneSchema = z.string().max(100).refine((zone) => {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true } catch { return false }
})

export const eventSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000),
  location: z.string().max(1000),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  timeZone: zoneSchema,
  repeat: z.enum(["", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  attendees: z.array(z.email()).max(50),
  reminder: z.number().int().min(0).max(10_080).nullable(),
}).superRefine((value, ctx) => {
  try {
    const format = value.allDay ? /^\d{4}-\d\d-\d\d$/ : /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/
    if (!format.test(value.start) || !format.test(value.end) || dateValue(value.start, value) >= dateValue(value.end, value)) throw new Error()
  } catch {
    ctx.addIssue({ code: "custom", path: ["end"], message: "Enter valid dates with an end after the start." })
  }
})

function dateValue(value: string, fields: Pick<EventFields, "allDay" | "timeZone">) {
  return fields.allDay
    ? Temporal.PlainDate.from(value).toZonedDateTime("UTC").epochMilliseconds
    : Temporal.PlainDateTime.from(value).toZonedDateTime(fields.timeZone, { disambiguation: "reject" }).epochMilliseconds
}

function milliseconds(value: ICAL.Time, zone: string) {
  if (value.isDate) return Date.parse(value.toString() + "T00:00:00Z")
  if (value.zone.tzid !== "floating") return value.toUnixTime() * 1000
  return Temporal.PlainDateTime.from(value.toString()).toZonedDateTime(zone).epochMilliseconds
}

export function parseCalendar(ics: string) {
  const calendar = new ICAL.Component(ICAL.parse(ics))
  const master = calendar.getAllSubcomponents("vevent").find((event) => !event.hasProperty("recurrence-id"))
  if (!master?.hasProperty("dtstart")) throw new Error("Calendar event is missing DTSTART")
  return { calendar, master }
}

function zoneFor(event: ICAL.Component, fallback: string) {
  const zone = String(event.getFirstProperty("dtstart")?.getParameter("tzid") ?? "")
  return zoneSchema.safeParse(zone).success ? zone : fallback
}

function fieldsFor(event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, displayZone: string): EventFields {
  const zone = zoneFor(event.component, displayZone)
  const format = (value: ICAL.Time) => value.isDate ? value.toString() : Temporal.Instant
    .fromEpochMilliseconds(milliseconds(value, zone)).toZonedDateTimeISO(displayZone).toPlainDateTime().toString({ smallestUnit: "second" })
  const trigger = event.component.getAllSubcomponents("valarm").find((alarm) => alarm.getFirstPropertyValue("action") === "DISPLAY")?.getFirstPropertyValue("trigger")
  return {
    title: event.summary || "",
    description: event.description || "",
    location: event.location || "",
    start: format(start),
    end: format(end),
    allDay: start.isDate,
    timeZone: displayZone,
    repeat: String((event.component.getFirstPropertyValue("rrule") as ICAL.Recur | null)?.freq ?? ""),
    attendees: event.attendees.map((property) => String(property.getFirstValue()).replace(/^mailto:/i, "")),
    reminder: trigger instanceof ICAL.Duration && trigger.toSeconds() <= 0 ? -trigger.toSeconds() / 60 : null,
  }
}

export function occurrences(ics: string, from: string, to: string, displayZone: string) {
  const { calendar, master } = parseCalendar(ics)
  if (master.getFirstPropertyValue("status") === "CANCELLED") return []
  const event = new ICAL.Event(master, { exceptions: calendar.getAllSubcomponents("vevent").filter((item) => item !== master) })
  const series = fieldsFor(event, event.startDate, event.endDate, zoneFor(master, displayZone))
  const result: Array<{ fields: EventFields; occurrence: string | null; series: EventFields; responses: Record<string, string> }> = []
  const append = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, occurrence: string | null) => {
    const fields = fieldsFor(item, start, end, displayZone)
    const finish = fields.end === fields.start ? fields.end + "~" : fields.end
    const lower = fields.allDay ? from : from + "T00:00:00"
    const upper = fields.allDay ? to : to + "T00:00:00"
    if (fields.start < upper && finish > lower && item.component.getFirstPropertyValue("status") !== "CANCELLED") {
      const responses = Object.fromEntries(item.attendees.flatMap((attendee) => {
        const status = attendee.getParameter("partstat")
        return typeof status === "string" ? [[String(attendee.getFirstValue()).replace(/^mailto:/i, ""), status]] : []
      }))
      result.push({ fields, occurrence, series, responses })
    }
  }
  if (!event.isRecurring()) append(event, event.startDate, event.endDate, null)
  else {
    const iterator = event.iterator()
    const included = new Set<ICAL.Event>()
    for (let count = 0; count < 100_000; count++) {
      const next = iterator.next()
      if (!next || next.toString().slice(0, 10) > to) break
      const details = event.getOccurrenceDetails(next)
      append(details.item, details.startDate, details.endDate, next.toString())
      included.add(details.item)
    }
    for (const exception of Object.values(event.exceptions)) {
      const recurrence = exception.recurrenceId.toString()
      if (!included.has(exception)) append(exception, exception.startDate, exception.endDate, recurrence)
    }
  }
  return result
}

export function occurrenceFields(ics: string, id: string) {
  const { calendar, master } = parseCalendar(ics)
  const exceptions = calendar.getAllSubcomponents("vevent").filter((item) => item !== master)
  const exception = exceptions.find((item) => String(item.getFirstPropertyValue("recurrence-id")) === id)
  const zone = zoneFor(exception ?? master, "UTC")
  if (exception) {
    const event = new ICAL.Event(exception)
    return fieldsFor(event, event.startDate, event.endDate, zone)
  }
  const day = id.slice(0, 10)
  const to = Temporal.PlainDate.from(day).add({ days: 1 }).toString()
  return occurrences(ics, day, to, zone).find((item) => item.occurrence === id)?.fields
}

function setTime(component: ICAL.Component, key: string, value: string, fields: EventFields) {
  component.removeAllProperties(key)
  const property = new ICAL.Property(key)
  const time = ICAL.Time.fromString(value.length === 16 ? value + ":00" : value, property)
  if (!fields.allDay) {
    if (fields.timeZone === "UTC") time.zone = ICAL.Timezone.utcTimezone
    else property.setParameter("tzid", fields.timeZone)
  }
  property.setValue(time)
  component.addProperty(property)
}

export function writeEvent(fields: EventFields, uid: string, existing?: string, occurrence?: string, cancelled = false) {
  const parsed = existing ? parseCalendar(existing) : undefined
  const calendar = parsed?.calendar ?? new ICAL.Component("vcalendar")
  const master = parsed?.master ?? new ICAL.Component("vevent")
  if (!parsed) {
    calendar.addPropertyWithValue("version", "2.0")
    calendar.addPropertyWithValue("prodid", "-//Dispatch//Calendar//EN")
    calendar.addSubcomponent(master)
  }
  if (!fields.allDay) ensureTimeZone(calendar, fields.timeZone, Number(fields.start.slice(0, 4)))
  let event = master
  if (occurrence) {
    event = calendar.getAllSubcomponents("vevent").find((item) => String(item.getFirstPropertyValue("recurrence-id")) === occurrence)
      ?? new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())))
    if (!event.parent) calendar.addSubcomponent(event)
    for (const key of ["rrule", "rdate", "exdate"]) event.removeAllProperties(key)
    if (!event.hasProperty("recurrence-id")) setTime(event, "recurrence-id", occurrence, {
      ...fields,
      allDay: occurrence.length === 10,
      timeZone: occurrence.endsWith("Z") ? "UTC" : zoneFor(master, fields.timeZone),
    })
  }
  event.updatePropertyWithValue("uid", uid)
  event.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true))
  event.updatePropertyWithValue("summary", fields.title)
  event.updatePropertyWithValue("description", fields.description)
  event.updatePropertyWithValue("location", fields.location)
  setTime(event, "dtstart", fields.start, fields)
  setTime(event, "dtend", fields.end, fields)
  event.removeAllProperties("duration")
  if (!occurrence) {
    const previous = event.getFirstPropertyValue("rrule") as ICAL.Recur | null
    if ((previous?.freq ?? "") !== fields.repeat) {
      event.removeAllProperties("rrule")
      if (!fields.repeat) {
        for (const exception of calendar.getAllSubcomponents("vevent")) {
          if (exception.hasProperty("recurrence-id")) calendar.removeSubcomponent(exception)
        }
      }
      if (fields.repeat) event.addPropertyWithValue("rrule", ICAL.Recur.fromString("FREQ=" + fields.repeat))
    }
  }
  for (const property of event.getAllProperties("attendee")) {
    if (!fields.attendees.includes(String(property.getFirstValue()).replace(/^mailto:/i, ""))) event.removeProperty(property)
  }
  const attendees = new Set(event.getAllProperties("attendee").map((p) => String(p.getFirstValue()).replace(/^mailto:/i, "")))
  for (const address of new Set(fields.attendees)) {
    if (!attendees.has(address)) event.addPropertyWithValue("attendee", "mailto:" + address)
  }
  if (cancelled) event.updatePropertyWithValue("status", "CANCELLED")
  const alarm = event.getAllSubcomponents("valarm").find((item) => item.getFirstPropertyValue("action") === "DISPLAY")
  if (fields.reminder === null) {
    if (alarm) event.removeSubcomponent(alarm)
  } else {
    const display = alarm ?? new ICAL.Component("valarm")
    display.updatePropertyWithValue("action", "DISPLAY")
    display.updatePropertyWithValue("description", fields.title)
    display.updatePropertyWithValue("trigger", ICAL.Duration.fromSeconds(-60 * fields.reminder))
    if (!alarm) event.addSubcomponent(display)
  }
  return calendar.toString() + "\r\n"
}

function ensureTimeZone(calendar: ICAL.Component, zone: string, year: number) {
  if (zone === "UTC" || calendar.getAllSubcomponents("vtimezone").some((item) => item.getFirstPropertyValue("tzid") === zone)) return
  const component = new ICAL.Component("vtimezone")
  component.addPropertyWithValue("tzid", zone)
  let current = Temporal.ZonedDateTime.from({ timeZone: zone, year: Math.max(1, year - 1), month: 1, day: 1 })
  const endYear = Math.max(2101, year + 30)
  const groups = new Map<string, ICAL.Component>()
  const add = (local: Temporal.PlainDateTime, before: string, after: string) => {
    const id = before + "/" + after
    const value = ICAL.Time.fromDateTimeString(local.toString({ smallestUnit: "second" }))
    const group = groups.get(id)
    if (group) group.addPropertyWithValue("rdate", value)
    else {
      const observance = new ICAL.Component(ICAL.UtcOffset.fromString(after).toSeconds() > ICAL.UtcOffset.fromString(before).toSeconds() ? "daylight" : "standard")
      observance.addPropertyWithValue("dtstart", value)
      observance.addPropertyWithValue("tzoffsetfrom", ICAL.UtcOffset.fromString(before))
      observance.addPropertyWithValue("tzoffsetto", ICAL.UtcOffset.fromString(after))
      component.addSubcomponent(observance)
      groups.set(id, observance)
    }
  }
  add(current.toPlainDateTime(), current.offset, current.offset)
  for (let next = current.getTimeZoneTransition("next"); next && next.year < endYear; next = current.getTimeZoneTransition("next")) {
    const before = next.subtract({ seconds: 1 })
    add(before.toPlainDateTime().add({ seconds: 1 }), before.offset, next.offset)
    current = next
  }
  calendar.addSubcomponent(component)
}
