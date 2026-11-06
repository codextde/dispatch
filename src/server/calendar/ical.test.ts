import { describe, expect, it } from "vitest"
import { eventSchema, occurrences, writeEvent } from "./ical"

const event = {
  title: "Review", description: "", location: "", start: "2026-03-22T09:00",
  end: "2026-03-22T10:00", allDay: false, timeZone: "Europe/Rome", repeat: "WEEKLY",
  attendees: ["member@example.com"], reminder: 15,
}

describe("calendar iCalendar resources", () => {
  it("keeps recurring wall times across the daylight saving transition", () => {
    const ics = writeEvent(event, "review@dispatch")
    expect(ics).toContain("BEGIN:VTIMEZONE")
    expect(occurrences(ics, "2026-03-22", "2026-03-31", "UTC").map(({ fields }) => fields.start)).toEqual([
      "2026-03-22T08:00:00",
      "2026-03-29T07:00:00",
    ])
    expect(occurrences(ics, "2026-03-22", "2026-03-31", "Europe/Rome").map(({ fields }) => [fields.start, fields.reminder])).toEqual([
      ["2026-03-22T09:00:00", 15],
      ["2026-03-29T09:00:00", 15],
    ])
  })

  it("moves and cancels an occurrence without altering the rest of the series", () => {
    const ics = writeEvent(event, "review@dispatch")
    const key = "2026-03-29T09:00:00"
    const moved = { ...event, start: "2026-03-30T11:00", end: "2026-03-30T12:00" }
    const changed = writeEvent(moved, "review@dispatch", ics, key)
    expect(occurrences(changed, "2026-03-22", "2026-04-07", "Europe/Rome").map(({ fields }) => fields.start)).toEqual([
      "2026-03-22T09:00:00",
      "2026-03-30T11:00:00",
      "2026-04-05T09:00:00",
    ])
    const cancelled = writeEvent(moved, "review@dispatch", changed, key, true)
    expect(occurrences(cancelled, "2026-03-22", "2026-04-07", "Europe/Rome").map(({ fields }) => fields.start)).toEqual([
      "2026-03-22T09:00:00",
      "2026-04-05T09:00:00",
    ])
  })

  it("keeps all-day dates unchanged between time zones and uses an exclusive end", () => {
    const ics = writeEvent({ ...event, allDay: true, start: "2026-03-29", end: "2026-03-31", repeat: "" }, "holiday@dispatch")
    const [entry] = occurrences(ics, "2026-03-30", "2026-03-31", "America/Los_Angeles")
    expect(entry?.fields.start).toBe("2026-03-29")
    expect(occurrences(ics, "2026-03-31", "2026-04-01", "Pacific/Auckland")).toEqual([])
  })

  it("rejects nonexistent local times and backwards dates", () => {
    expect(eventSchema.safeParse({ ...event, start: "2026-03-29T02:30", end: "2026-03-29T04:00" }).success).toBe(false)
    expect(eventSchema.safeParse({ ...event, end: event.start }).success).toBe(false)
  })
})
