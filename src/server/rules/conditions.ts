import vm from "node:vm"
import type { OrgSettings, Participant, RuleCondition, RuleConditions } from "@/server/db/schema"
import { backtrackingRisk } from "@/components/settings/rules/definitions"

/**
 * Pure evaluation of rule conditions (no I/O) — unit tested in
 * src/server/mail/__tests__/conditions.test.ts.
 *
 * All comparisons are case-insensitive. Multi-valued fields (to, cc, labels,
 * from name/address) match when ANY value matches; negated operators
 * (not_contains, not_equals) match when NO value matches.
 */

export type RuleEvalContext = {
  from: Participant | null
  to: Participant[]
  cc: Participant[]
  subject: string
  body: string
  account: { id: string; email: string; name: string } | null
  hasAttachment: boolean
  /** lowercase header names */
  headers: Record<string, string>
  labels: { id: string; name: string }[]
  /** Message arrived within the workspace's business hours (true when not configured) */
  inBusinessHours: boolean
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/**
 * Is `date` inside the business hours (days 0 = Sunday … 6, "HH:MM" start/end,
 * end exclusive) in `timeZone`? Always true when business hours are disabled.
 * Overnight ranges (start > end, e.g. 22:00–06:00) belong to the day they start:
 * Saturday 03:00 is inside a Friday night shift.
 */
export function isWithinBusinessHours(date: Date, hours: OrgSettings["businessHours"], timeZone = "UTC"): boolean {
  if (hours?.enabled !== true) return true
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date)
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = format(timeZone || "UTC")
  } catch {
    parts = format("UTC")
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const day = WEEKDAYS[get("weekday")]
  if (day === undefined) return true
  const time = `${get("hour").padStart(2, "0")}:${get("minute").padStart(2, "0")}`
  const days = hours.days?.length ? hours.days : [1, 2, 3, 4, 5]
  const start = hours.start || "09:00"
  const end = hours.end || "17:00"
  if (start === end) return days.includes(day) // whole day
  if (start < end) return days.includes(day) && time >= start && time < end
  if (time >= start) return days.includes(day)
  if (time < end) return days.includes((day + 6) % 7)
  return false
}

const MAX_PATTERN_LENGTH = 300
/** Regexes only look at the first 10k characters of a field */
const MAX_REGEX_INPUT = 10_000
const REGEX_TIMEOUT_MS = 50
const regexCache = new Map<string, RegExp | null>()

// User-supplied patterns run inside a vm context with a hard timeout: a
// catastrophic pattern that slips past the static checks can only cost 50ms.
const regexSandbox = vm.createContext(Object.create(null) as Record<string, unknown>)
const regexScript = new vm.Script("re.test(input)")

/** `re.test(input)` with a time limit; a timeout counts as "no match". */
export function regexTest(re: RegExp, input: string, timeoutMs = REGEX_TIMEOUT_MS): boolean {
  regexSandbox.re = re
  regexSandbox.input = input.slice(0, MAX_REGEX_INPUT)
  try {
    return regexScript.runInContext(regexSandbox, { timeout: timeoutMs }) === true
  } catch {
    return false
  } finally {
    regexSandbox.re = null
    regexSandbox.input = null
  }
}

/**
 * Compile a user-supplied regular expression defensively: length-limited,
 * rejects patterns prone to catastrophic backtracking (the same check the
 * rule builder uses, see `backtrackingRisk`) and never throws. Matching also
 * runs under a time limit (`regexTest`) as a second line of defense.
 */
export function safeRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!
  let re: RegExp | null = null
  const nestedQuantifier = /\((?:[^()\\]|\\.)*[+*}?]\)\s*[+*{]/
  if (
    pattern &&
    pattern.length <= MAX_PATTERN_LENGTH &&
    !nestedQuantifier.test(pattern) &&
    !/\\[1-9]/.test(pattern) &&
    !backtrackingRisk(pattern)
  ) {
    try {
      re = new RegExp(pattern, "i")
    } catch {
      re = null
    }
  }
  if (regexCache.size > 500) regexCache.clear()
  regexCache.set(pattern, re)
  return re
}

function participantValues(list: Participant[]): string[] {
  return list.flatMap((p) => [p.email, p.name ?? ""].filter(Boolean)).map((s) => s.toLowerCase())
}

/** Candidate values of a field; `null` for boolean fields. */
function fieldValues(cond: RuleCondition, ctx: RuleEvalContext): string[] | boolean {
  switch (cond.field) {
    case "from":
      return ctx.from
        ? [ctx.from.email, ctx.from.name ?? "", ctx.from.name ? `${ctx.from.name} <${ctx.from.email}>` : ""]
            .filter(Boolean)
            .map((s) => s.toLowerCase())
        : []
    case "to":
      return participantValues(ctx.to)
    case "cc":
      return participantValues(ctx.cc)
    case "subject":
      return [ctx.subject.toLowerCase()]
    case "body":
      return [ctx.body.toLowerCase()]
    case "account":
      return ctx.account ? [ctx.account.id, ctx.account.email, ctx.account.name].map((s) => s.toLowerCase()) : []
    case "has_attachment":
      return ctx.hasAttachment
    case "header": {
      const name = cond.header?.trim().toLowerCase()
      if (!name) return []
      const value = ctx.headers[name]
      return value === undefined ? [] : [value.toLowerCase()]
    }
    case "label":
      return ctx.labels.flatMap((l) => [l.id.toLowerCase(), l.name.toLowerCase()])
    case "business_hours":
      return ctx.inBusinessHours
    case "domain": {
      const domain = ctx.from?.email.split("@")[1]?.toLowerCase()
      return domain ? [domain] : []
    }
    default:
      return []
  }
}

export function evaluateCondition(cond: RuleCondition, ctx: RuleEvalContext): boolean {
  const values = fieldValues(cond, ctx)
  const op = cond.operator

  if (typeof values === "boolean") {
    if (op === "is_true") return values
    if (op === "is_false") return !values
    const v = (cond.value ?? "").trim().toLowerCase()
    const expected = v === "true" || v === "yes" || v === "1"
    if (op === "equals") return values === expected
    if (op === "not_equals") return values !== expected
    return false
  }

  const needle = (cond.value ?? "").trim().toLowerCase()
  switch (op) {
    case "is_true":
      return values.some((v) => v.trim() !== "")
    case "is_false":
      return !values.some((v) => v.trim() !== "")
    case "equals":
      return values.some((v) => v.trim() === needle)
    case "not_equals":
      return !values.some((v) => v.trim() === needle)
    case "contains":
      return needle !== "" && values.some((v) => v.includes(needle))
    case "not_contains":
      return needle === "" || !values.some((v) => v.includes(needle))
    case "starts_with":
      return needle !== "" && values.some((v) => v.trimStart().startsWith(needle))
    case "ends_with":
      return needle !== "" && values.some((v) => v.trimEnd().endsWith(needle))
    case "matches": {
      const re = safeRegex((cond.value ?? "").trim())
      if (!re) return false
      return values.some((v) => regexTest(re, v))
    }
    default:
      return false
  }
}

/** "matches" patterns of a rule that are refused (invalid or prone to catastrophic backtracking). */
export function unsafePatterns(conditions: RuleConditions | null | undefined): string[] {
  return (conditions?.conditions ?? [])
    .filter((c) => c.operator === "matches" && !safeRegex((c.value ?? "").trim()))
    .map((c) => c.value ?? "")
}

/** Evaluate a rule's conditions. A rule without conditions matches everything. */
export function evaluateConditions(conditions: RuleConditions | null | undefined, ctx: RuleEvalContext): boolean {
  const list = conditions?.conditions ?? []
  if (!list.length) return true
  return conditions?.match === "any"
    ? list.some((c) => evaluateCondition(c, ctx))
    : list.every((c) => evaluateCondition(c, ctx))
}
