import { describe, expect, it } from "vitest"
import type { RuleCondition, RuleConditions } from "@/server/db/schema"
import {
  createRegexBudget,
  evaluateCondition,
  evaluateConditions,
  isWithinBusinessHours,
  regexTest,
  safeRegex,
  unsafePatterns,
  type RuleEvalContext,
} from "@/server/rules/conditions"

const ctx: RuleEvalContext = {
  from: { name: "Anna Schmidt", email: "anna@Example.org".toLowerCase() },
  to: [{ name: "Acme Support", email: "support@acme.test" }],
  cc: [{ name: null, email: "bob@partner.test" }],
  subject: "URGENT: Invoice #1234 is wrong",
  body: "Hello team,\nthe invoice total is off by 10 EUR.\nThanks",
  account: { id: "11111111-1111-1111-1111-111111111111", email: "support@acme.test", name: "Acme Support" },
  hasAttachment: true,
  headers: { "x-customer-tier": "Gold", "list-id": "<news.example.org>" },
  labels: [{ id: "22222222-2222-2222-2222-222222222222", name: "Billing" }],
  inBusinessHours: false,
}

const c = (field: RuleCondition["field"], operator: RuleCondition["operator"], value?: string, header?: string): RuleCondition => ({
  field,
  operator,
  value,
  header,
})

describe("evaluateCondition", () => {
  it.each([
    [c("subject", "contains", "invoice"), true],
    [c("subject", "contains", "INVOICE"), true],
    [c("subject", "not_contains", "refund"), true],
    [c("subject", "not_contains", "invoice"), false],
    [c("subject", "starts_with", "urgent"), true],
    [c("subject", "ends_with", "WRONG"), true],
    [c("subject", "equals", "urgent: invoice #1234 is wrong"), true],
    [c("subject", "not_equals", "something else"), true],
    [c("from", "equals", "anna@example.org"), true],
    [c("from", "contains", "schmidt"), true],
    [c("from", "ends_with", "@example.org"), true],
    [c("to", "contains", "support@"), true],
    [c("to", "not_contains", "sales@"), true],
    [c("cc", "equals", "bob@partner.test"), true],
    [c("body", "contains", "off by 10 eur"), true],
    [c("domain", "equals", "example.org"), true],
    [c("domain", "not_equals", "example.org"), false],
    [c("account", "equals", "11111111-1111-1111-1111-111111111111"), true],
    [c("account", "equals", "support@acme.test"), true],
    [c("has_attachment", "is_true"), true],
    [c("has_attachment", "is_false"), false],
    [c("has_attachment", "equals", "true"), true],
    [c("header", "equals", "gold", "X-Customer-Tier"), true],
    [c("header", "is_true", undefined, "list-id"), true],
    [c("header", "is_false", undefined, "precedence"), true],
    [c("header", "contains", "x", "precedence"), false],
    [c("header", "not_contains", "bulk", "precedence"), true],
    [c("label", "equals", "billing"), true],
    [c("label", "equals", "22222222-2222-2222-2222-222222222222"), true],
    [c("label", "not_equals", "Sales"), true],
    [c("subject", "matches", "invoice #\\d+"), true],
    [c("subject", "matches", "^refund"), false],
    [c("body", "matches", "\\bEUR\\b"), true],
  ])("%j → %s", (cond, expected) => {
    expect(evaluateCondition(cond, ctx)).toBe(expected)
  })

  it("never matches with an empty value for substring operators", () => {
    expect(evaluateCondition(c("subject", "contains", ""), ctx)).toBe(false)
    expect(evaluateCondition(c("subject", "starts_with", "  "), ctx)).toBe(false)
  })

  it("handles messages without sender", () => {
    const noFrom = { ...ctx, from: null }
    expect(evaluateCondition(c("from", "contains", "a"), noFrom)).toBe(false)
    expect(evaluateCondition(c("from", "not_contains", "a"), noFrom)).toBe(true)
    expect(evaluateCondition(c("domain", "equals", "example.org"), noFrom)).toBe(false)
  })
})

describe("evaluateConditions", () => {
  it("matches everything without conditions", () => {
    expect(evaluateConditions({ match: "all", conditions: [] }, ctx)).toBe(true)
    expect(evaluateConditions(undefined, ctx)).toBe(true)
  })
  it("supports all / any", () => {
    const yes = c("subject", "contains", "invoice")
    const no = c("subject", "contains", "refund")
    expect(evaluateConditions({ match: "all", conditions: [yes, no] }, ctx)).toBe(false)
    expect(evaluateConditions({ match: "any", conditions: [yes, no] }, ctx)).toBe(true)
    expect(evaluateConditions({ match: "all", conditions: [yes, yes] }, ctx)).toBe(true)
  })
})

describe("safeRegex", () => {
  it("compiles case-insensitive patterns", () => {
    expect(safeRegex("abc")?.test("xABCx")).toBe(true)
  })
  it("rejects invalid, oversized and catastrophic patterns", () => {
    expect(safeRegex("(unclosed")).toBeNull()
    expect(safeRegex("a".repeat(301))).toBeNull()
    expect(safeRegex("(a+)+$")).toBeNull()
    expect(safeRegex("(.*)*x")).toBeNull()
    expect(safeRegex("(\\w+\\s?)+$")).toBeNull()
    expect(safeRegex("(a)\\1")).toBeNull()
  })
  it.each(["(a|a)*$", "(.*a){8}$", "((a+))+$", "(\\w+|x)+$", "(a|aa)+$"])("refuses backtracking-prone %s", (pattern) => {
    expect(safeRegex(pattern)).toBeNull()
    const started = Date.now()
    expect(evaluateCondition(c("body", "matches", pattern), { ...ctx, body: "a".repeat(5000) + "!" })).toBe(false)
    expect(Date.now() - started).toBeLessThan(200)
  })
  it("interrupts slow matching that slips past the static checks", () => {
    const started = Date.now()
    expect(regexTest(/((a+))+$/, "a".repeat(40) + "!")).toBe(false)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(regexTest(/inv\w+/i, "INVOICE")).toBe(true)
  })
  it("lists refused patterns of a rule", () => {
    expect(unsafePatterns({ match: "all", conditions: [c("subject", "matches", "(a|a)*$"), c("subject", "matches", "^ok")] })).toEqual(["(a|a)*$"])
  })
  it("treats a bad regex condition as not matching", () => {
    expect(evaluateCondition(c("subject", "matches", "(a+)+$"), ctx)).toBe(false)
  })
})

describe("regex time budget (M11)", () => {
  // Accepted by the rule builder, but slow on long inputs full of "x"
  const slow: RuleConditions = { match: "all", conditions: [c("to", "matches", "x.*x.*x.*x.*y")] }
  const flood = (n: number): RuleEvalContext => ({
    ...ctx,
    to: Array.from({ length: n }, (_, i) => ({ name: "x".repeat(200), email: `u${i}@victim.test` })),
  })

  it("caps the total time per message, however many recipients there are", () => {
    expect(safeRegex("x.*x.*x.*x.*y")).not.toBeNull()
    for (const n of [200, 1600]) {
      const started = performance.now()
      expect(evaluateConditions(slow, flood(n))).toBe(false)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  })

  it("shares one budget across all rules of a message", () => {
    const shared = { ...flood(200), regexBudget: createRegexBudget(100) }
    const started = performance.now()
    for (let rule = 0; rule < 20; rule++) evaluateConditions(slow, shared)
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(shared.regexBudget.remainingMs).toBeLessThan(1) // spent: vm timeouts are whole milliseconds
    // Once spent, regex conditions stop matching; other operators keep working
    expect(evaluateConditions({ match: "all", conditions: [c("subject", "matches", "invoice")] }, shared)).toBe(false)
    expect(evaluateConditions({ match: "all", conditions: [c("subject", "contains", "invoice")] }, shared)).toBe(true)
  })

  it("only matches the first 50 recipients with regexes (substring operators see all)", () => {
    const many = flood(80)
    expect(evaluateCondition(c("to", "matches", "^u10@"), many)).toBe(true)
    expect(evaluateCondition(c("to", "matches", "^u70@"), many)).toBe(false)
    expect(evaluateCondition(c("to", "contains", "u70@"), many)).toBe(true)
  })
})

describe("business hours", () => {
  const hours = { enabled: true, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }
  it("is always true when disabled", () => {
    expect(isWithinBusinessHours(new Date("2026-09-27T03:00:00Z"), { enabled: false }, "UTC")).toBe(true)
    expect(isWithinBusinessHours(new Date("2026-09-27T03:00:00Z"), undefined)).toBe(true)
  })
  it("checks weekday and time in the workspace time zone", () => {
    // Monday 2026-09-28 08:30 UTC = 10:30 in Berlin (CEST)
    const monday = new Date("2026-09-28T08:30:00Z")
    expect(isWithinBusinessHours(monday, hours, "Europe/Berlin")).toBe(true)
    expect(isWithinBusinessHours(monday, hours, "America/New_York")).toBe(false) // 04:30
    expect(isWithinBusinessHours(new Date("2026-09-28T15:00:00Z"), hours, "Europe/Berlin")).toBe(false) // 17:00 (end exclusive)
    expect(isWithinBusinessHours(new Date("2026-09-27T10:00:00Z"), hours, "Europe/Berlin")).toBe(false) // Sunday
    // Unknown time zones fall back to UTC
    expect(isWithinBusinessHours(monday, hours, "Not/AZone")).toBe(false) // 08:30 UTC
    expect(isWithinBusinessHours(new Date("2026-09-28T09:00:00Z"), hours, "Not/AZone")).toBe(true)
  })
  it("handles overnight ranges (the shift belongs to the day it starts)", () => {
    const night = { enabled: true, days: [5], start: "22:00", end: "06:00" } // Friday night shift
    expect(isWithinBusinessHours(new Date("2026-10-02T23:30:00Z"), night, "UTC")).toBe(true) // Fri 23:30
    expect(isWithinBusinessHours(new Date("2026-10-03T03:00:00Z"), night, "UTC")).toBe(true) // Sat 03:00
    expect(isWithinBusinessHours(new Date("2026-10-03T06:00:00Z"), night, "UTC")).toBe(false) // Sat 06:00
    expect(isWithinBusinessHours(new Date("2026-10-02T03:00:00Z"), night, "UTC")).toBe(false) // Fri 03:00 (Thursday's shift)
    expect(isWithinBusinessHours(new Date("2026-10-02T12:00:00Z"), night, "UTC")).toBe(false)
  })
  it("treats start == end as the whole day", () => {
    expect(isWithinBusinessHours(new Date("2026-09-28T02:00:00Z"), { enabled: true, days: [1], start: "00:00", end: "00:00" }, "UTC")).toBe(true)
  })
  it("drives the business_hours condition", () => {
    expect(evaluateCondition(c("business_hours", "is_false"), ctx)).toBe(true)
    expect(evaluateCondition(c("business_hours", "is_true"), { ...ctx, inBusinessHours: true })).toBe(true)
  })
})
