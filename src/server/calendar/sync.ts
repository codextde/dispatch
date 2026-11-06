import "server-only"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { decryptJson } from "@/server/crypto"
import { publish } from "@/server/realtime"
import { readArubaEvents, type ArubaCredentials } from "./aruba"

const { calendars, calendarEvents } = schema
export type CalendarRow = typeof calendars.$inferSelect

export function calendarCredentials(calendar: CalendarRow) {
  const credentials = decryptJson<ArubaCredentials>(calendar.credentialEnc)
  if (!credentials) throw new Error("Calendar credentials are unavailable")
  return credentials
}

export async function syncArubaCalendar(orgId: string, id: string, force = false) {
  try {
    const changed = await db.transaction(async (tx) => {
      const [calendar] = await tx.select().from(calendars).where(and(eq(calendars.orgId, orgId), eq(calendars.id, id))).for("update", { skipLocked: true })
      if (!calendar?.remotePath || (!force && calendar.syncedAt && Date.now() - calendar.syncedAt.getTime() < 55_000)) return false
      const incoming = await readArubaEvents(calendarCredentials(calendar), calendar.remotePath)
      const rows = await tx.select({ id: calendarEvents.id, remotePath: calendarEvents.remotePath, etag: calendarEvents.etag })
        .from(calendarEvents).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.calendarId, id)))
      const existing = new Map(rows.map((row) => [row.remotePath, row]))
      let dirty = Boolean(calendar.syncError || !calendar.syncedAt)
      for (const item of incoming) {
        const row = existing.get(item.remotePath)
        existing.delete(item.remotePath)
        if (row?.etag === item.etag) continue
        dirty = true
        if (row) {
          await tx.update(calendarEvents).set({ ...item, version: crypto.randomUUID() })
            .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, row.id)))
        } else {
          await tx.insert(calendarEvents).values({ ...item, orgId, calendarId: id })
        }
      }
      for (const row of existing.values()) {
        dirty = true
        await tx.delete(calendarEvents).where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, row.id)))
      }
      await tx.update(calendars).set({ syncedAt: new Date(), syncError: null }).where(and(eq(calendars.orgId, orgId), eq(calendars.id, id)))
      return dirty
    })
    if (changed) await publish({ orgId, type: "calendar.updated" })
  } catch (err) {
    const message = err instanceof Error && err.message.startsWith("Aruba CalDAV request failed") ? err.message : "Unable to sync Aruba calendar"
    await db.update(calendars).set({ syncError: message }).where(and(eq(calendars.orgId, orgId), eq(calendars.id, id)))
    await publish({ orgId, type: "calendar.updated" })
  }
}

export async function syncArubaCalendars() {
  const rows = await db.select({ id: calendars.id, orgId: calendars.orgId }).from(calendars)
    .where(isNotNull(calendars.remotePath)).orderBy(sql`${calendars.syncedAt} asc nulls first`)
  for (const row of rows) await syncArubaCalendar(row.orgId, row.id)
  return rows.length
}
