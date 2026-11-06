import "server-only"
import { createHash } from "node:crypto"
import { and, eq, isNotNull, isNull, like } from "drizzle-orm"
import { Temporal } from "@js-temporal/polyfill"
import { db, schema } from "@/server/db"
import { publish } from "@/server/realtime"
import { addDays, dateKey } from "@/lib/calendar"
import { occurrences, zoneSchema } from "./ical"

export async function sendCalendarReminders() {
  const { calendars, calendarEvents, memberships, notifications, users } = schema
  const now = Date.now()
  const rows = await db.select({ entry: calendarEvents, timezone: users.timezone }).from(calendarEvents)
    .innerJoin(calendars, and(eq(calendars.orgId, calendarEvents.orgId), eq(calendars.id, calendarEvents.calendarId)))
    .innerJoin(memberships, and(eq(memberships.orgId, calendarEvents.orgId), eq(memberships.userId, calendarEvents.creatorId), eq(memberships.status, "active")))
    .innerJoin(users, eq(users.id, calendarEvents.creatorId))
    .where(and(isNull(calendars.accountId), isNotNull(calendarEvents.creatorId), like(calendarEvents.ics, "%BEGIN:VALARM%")))
  let count = 0
  for (const { entry, timezone } of rows) {
    const parsed = zoneSchema.safeParse(timezone)
    const tz = parsed.success ? parsed.data : "UTC"
    const day = dateKey(new Date(now), tz)
    const upcoming = occurrences(entry.ics, addDays(day, -1), addDays(day, 8), tz)
    for (const { fields, occurrence } of upcoming) {
      if (fields.reminder === null) continue
      const at = fields.allDay
        ? Temporal.PlainDate.from(fields.start).toZonedDateTime(tz).epochMilliseconds
        : Temporal.PlainDateTime.from(fields.start).toZonedDateTime(tz).epochMilliseconds
      const due = at - fields.reminder * 60_000
      if (due > now || due <= now - 15 * 60_000) continue
      const key = createHash("sha256").update(JSON.stringify([entry.id, occurrence, at, due])).digest("hex").slice(0, 32)
      const id = [key.slice(0, 8), key.slice(8, 12), key.slice(12, 16), key.slice(16, 20), key.slice(20)].join("-")
      const userId = entry.creatorId!
      const inserted = await db.transaction(async (tx) => {
        const [current] = await tx.select({ version: calendarEvents.version }).from(calendarEvents)
          .where(and(eq(calendarEvents.orgId, entry.orgId), eq(calendarEvents.id, entry.id))).for("share")
        if (current?.version !== entry.version) return []
        return tx.insert(notifications).values({
          id, orgId: entry.orgId, userId, type: "reminder", title: fields.title || "Calendar event", data: { calendarEventId: entry.id },
        }).onConflictDoNothing().returning({ id: notifications.id })
      })
      if (!inserted.length) continue
      count++
      await publish({ orgId: entry.orgId, type: "notification.created", userIds: [userId] })
    }
  }
  return count
}
