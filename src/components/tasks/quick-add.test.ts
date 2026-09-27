import { describe, expect, it } from "vitest"
import { parseQuickAdd } from "./quick-add"

const members = [
  { id: "u-me", name: "Alice Doe", email: "alice@example.com" },
  { id: "u-maya", name: "Maya Chen", email: "maya@northwind.demo" },
  { id: "u-mark", name: "Mark Twain", email: "mark@northwind.demo" },
]
const teams = [
  { id: "t-support", name: "Support" },
  { id: "t-sales", name: "Sales" },
]
// Wednesday, 2026-09-23 10:00 local time
const now = new Date(2026, 8, 23, 10, 0, 0)
const opts = { members, teams, meId: "u-me", now }
const ymd = (d?: Date) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}h` : undefined)

describe("parseQuickAdd", () => {
  it("extracts assignee, team and due date", () => {
    const r = parseQuickAdd("Call Hannah back @maya tomorrow #support", opts)
    expect(r.title).toBe("Call Hannah back")
    expect(r.assignee?.id).toBe("u-maya")
    expect(r.team?.id).toBe("t-support")
    expect(ymd(r.dueAt)).toBe("2026-9-24 17h")
    expect(r.dueLabel).toBe("Tomorrow")
  })

  it("supports @me, prefixes and weekday names", () => {
    const r = parseQuickAdd("Send quote @me fri", opts)
    expect(r.assignee?.id).toBe("u-me")
    expect(ymd(r.dueAt)).toBe("2026-9-25 17h")
    expect(parseQuickAdd("x @mar", opts).assignee?.id).toBe("u-mark")
    expect(ymd(parseQuickAdd("x next fri", opts).dueAt)).toBe("2026-10-2 17h")
    expect(ymd(parseQuickAdd("x wednesday", opts).dueAt)).toBe("2026-9-30 17h")
  })

  it("handles relative and ISO dates", () => {
    expect(ymd(parseQuickAdd("x in 3 days", opts).dueAt)).toBe("2026-9-26 17h")
    expect(ymd(parseQuickAdd("x in 2 weeks", opts).dueAt)).toBe("2026-10-7 17h")
    expect(ymd(parseQuickAdd("x next week", opts).dueAt)).toBe("2026-9-28 17h")
    expect(ymd(parseQuickAdd("x 2026-10-03", opts).dueAt)).toBe("2026-10-3 17h")
    expect(parseQuickAdd("x 2026-02-31", opts).dueAt).toBeUndefined()
  })

  it("leaves unknown mentions and words inside the title", () => {
    const r = parseQuickAdd("Email bob@acme.com about @nobody #random tasks", opts)
    expect(r.title).toBe("Email bob@acme.com about @nobody #random tasks")
    expect(r.assignee).toBeUndefined()
    expect(r.team).toBeUndefined()
    expect(r.dueAt).toBeUndefined()
    expect(parseQuickAdd("Review todays numbers", opts).dueAt).toBeUndefined()
  })
})
