export type CalendarSource = {
  id: string
  name: string
  kind: "personal" | "shared" | "aruba"
  writable: boolean
  manageable: boolean
  syncedAt: string | null
  syncError: string | null
}

export type EventFields = {
  title: string
  description: string
  location: string
  start: string
  end: string
  allDay: boolean
  timeZone: string
  repeat: string
  attendees: string[]
  reminder: number | null
}

export type CalendarEntry = EventFields & {
  id: string
  calendarId: string
  version: string
  occurrence: string | null
  series: EventFields
  conversationId: string | null
  writable: boolean
  organizerAccountId: string | null
  responses: Record<string, string>
}

export function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(date)
}

export function addDays(day: string, count: number) {
  const date = new Date(day + "T00:00:00Z")
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
