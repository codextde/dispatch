/**
 * Rule definitions shared by the rule builder (client) and the server-side
 * validation in src/server/workspace/services/rules.ts. Pure TypeScript — no
 * React or server imports. Shapes mirror RuleCondition / RuleAction in
 * src/server/db/schema.ts exactly (the mail engine executes these rows).
 */
import type { RuleAction, RuleCondition, RuleConditions } from "@/server/db/schema"

export type { RuleAction, RuleCondition, RuleConditions }

export type RuleScope = "workspace" | "personal"
export type RuleTrigger = "incoming" | "outgoing"
export type ConditionField = RuleCondition["field"]
export type ConditionOperator = RuleCondition["operator"]
export type ActionType = RuleAction["type"]

export const RULE_LIMITS = {
  name: 120,
  description: 500,
  conditions: 25,
  actions: 20,
  value: 500,
  regex: 200,
  header: 100,
  comment: 5000,
  subject: 200,
  body: 20_000,
  url: 2000,
  snoozeMinutes: 60 * 24 * 365,
} as const

export const TRIGGERS: { value: RuleTrigger; label: string; description: string }[] = [
  { value: "incoming", label: "Incoming email", description: "Runs when a new email arrives in an inbox." },
  { value: "outgoing", label: "Outgoing email", description: "Runs when a teammate sends an email." },
]

export const TEXT_OPERATORS: ConditionOperator[] = [
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "ends_with",
  "matches",
]

type FieldKind = "text" | "boolean" | "account" | "label"

export const CONDITION_FIELDS: Record<
  ConditionField,
  { label: string; kind: FieldKind; operators: ConditionOperator[]; placeholder?: string; hint?: string }
> = {
  from: { label: "From", kind: "text", operators: TEXT_OPERATORS, placeholder: "billing@stripe.com", hint: "Sender name or address" },
  to: { label: "To", kind: "text", operators: TEXT_OPERATORS, placeholder: "support@acme.com", hint: "Any recipient in To" },
  cc: { label: "Cc", kind: "text", operators: TEXT_OPERATORS, placeholder: "team@acme.com", hint: "Any recipient in Cc" },
  subject: { label: "Subject", kind: "text", operators: TEXT_OPERATORS, placeholder: "invoice" },
  body: { label: "Body", kind: "text", operators: TEXT_OPERATORS, placeholder: "refund" },
  domain: { label: "Sender domain", kind: "text", operators: TEXT_OPERATORS, placeholder: "acme.com" },
  header: { label: "Header", kind: "text", operators: TEXT_OPERATORS, placeholder: "value" },
  has_attachment: { label: "Has attachment", kind: "boolean", operators: ["is_true", "is_false"] },
  business_hours: {
    label: "Business hours",
    kind: "boolean",
    operators: ["is_true", "is_false"],
    hint: "Uses the hours set in Settings → General. Always “during” when business hours are off.",
  },
  account: { label: "Inbox", kind: "account", operators: ["equals", "not_equals"] },
  label: { label: "Label", kind: "label", operators: ["equals", "not_equals"] },
}

export const CONDITION_FIELD_ORDER: ConditionField[] = [
  "from",
  "to",
  "cc",
  "subject",
  "body",
  "domain",
  "has_attachment",
  "business_hours",
  "account",
  "label",
  "header",
]

const TEXT_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is",
  not_equals: "is not",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches regex",
  is_true: "is yes",
  is_false: "is no",
}

export function operatorLabel(field: ConditionField, op: ConditionOperator): string {
  if (field === "has_attachment") return op === "is_true" ? "is yes" : "is no"
  if (field === "business_hours") return op === "is_true" ? "received during" : "received outside"
  if (field === "label") return op === "equals" ? "includes" : "does not include"
  if (field === "account") return op === "equals" ? "is" : "is not"
  return TEXT_OPERATOR_LABELS[op]
}

export const ACTION_GROUPS = ["Organize", "Status", "Communicate"] as const

export const ACTION_DEFS: Record<ActionType, { label: string; group: (typeof ACTION_GROUPS)[number]; description: string }> = {
  add_label: { label: "Add label", group: "Organize", description: "Apply a label to the conversation." },
  remove_label: { label: "Remove label", group: "Organize", description: "Remove a label from the conversation." },
  assign: { label: "Assign to teammate", group: "Organize", description: "Assign the conversation to a teammate." },
  assign_team: { label: "Assign to team", group: "Organize", description: "Route the conversation to a team." },
  close: { label: "Close", group: "Status", description: "Close the conversation." },
  snooze: { label: "Snooze", group: "Status", description: "Hide the conversation until later." },
  star: { label: "Star", group: "Status", description: "Star the conversation." },
  priority: { label: "Mark as priority", group: "Status", description: "Flag the conversation as priority." },
  mark_read: { label: "Mark as read", group: "Status", description: "Mark the conversation as read for everyone." },
  mark_spam: { label: "Mark as spam", group: "Status", description: "Move the conversation to spam." },
  trash: { label: "Move to trash", group: "Status", description: "Move the conversation to trash." },
  auto_reply: { label: "Send auto-reply", group: "Communicate", description: "Reply automatically to the sender." },
  forward: { label: "Forward", group: "Communicate", description: "Forward the email to an address." },
  comment: { label: "Add internal comment", group: "Communicate", description: "Post an internal note for the team." },
  webhook: { label: "Call webhook", group: "Communicate", description: "POST the conversation as JSON to a URL." },
}

export const ACTION_ORDER: ActionType[] = [
  "add_label",
  "remove_label",
  "assign",
  "assign_team",
  "close",
  "snooze",
  "star",
  "priority",
  "mark_read",
  "mark_spam",
  "trash",
  "auto_reply",
  "forward",
  "comment",
  "webhook",
]

/** Actions without parameters may only appear once per rule. */
export const PARAMETERLESS_ACTIONS: ActionType[] = ["close", "star", "priority", "mark_read", "mark_spam", "trash"]

export const SNOOZE_PRESETS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "1 day" },
  { minutes: 10080, label: "1 week" },
] as const

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—"
  const units: [number, string][] = [
    [10080, "week"],
    [1440, "day"],
    [60, "hour"],
    [1, "minute"],
  ]
  for (const [size, name] of units) {
    if (minutes % size === 0) {
      const n = minutes / size
      return `${n} ${name}${n === 1 ? "" : "s"}`
    }
  }
  return `${minutes} minutes`
}

/** The rule as sent by the builder to the server. */
export type RuleInput = {
  name: string
  description: string
  trigger: RuleTrigger
  enabled: boolean
  accountIds: string[]
  conditions: RuleConditions
  actions: RuleAction[]
  stopProcessing: boolean
}

/* -------------------------------------------------------------------------- */
/*                            Structural validation                           */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/
const HEADER_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/

export function isValidEmail(v: string) {
  return v.length <= 254 && EMAIL_RE.test(v)
}

/** https:// anywhere; http:// only for localhost when `allowHttpLocalhost` (development). */
export function webhookUrlError(raw: string, allowHttpLocalhost: boolean): string | null {
  const v = raw.trim()
  if (!v) return "Enter a URL"
  if (v.length > RULE_LIMITS.url) return "URL is too long"
  let url: URL
  try {
    url = new URL(v)
  } catch {
    return "Enter a valid URL, e.g. https://example.com/hook"
  }
  if (url.username || url.password) return "Credentials in the URL are not allowed"
  if (url.protocol === "https:") return null
  if (url.protocol === "http:") {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (local && allowHttpLocalhost) return null
    return allowHttpLocalhost ? "Use https:// (http:// is only allowed for localhost)" : "Use an https:// URL"
  }
  return "Use an https:// URL"
}

export function regexError(pattern: string): string | null {
  if (!pattern) return "Enter a regular expression"
  if (pattern.length > RULE_LIMITS.regex) return `Keep the pattern under ${RULE_LIMITS.regex} characters`
  try {
    new RegExp(pattern)
  } catch (err) {
    return err instanceof Error ? `Invalid regex: ${err.message.replace(/^Invalid regular expression: /, "")}` : "Invalid regex"
  }
  return backtrackingRisk(pattern)
}

/** Quantifier starting at `j`: `*`, `+`, `?` or `{n}`, `{n,}`, `{n,m}` (plus a lazy `?`). */
function quantifierAt(p: string, j: number): { length: number; openEnded: boolean } | null {
  const ch = p[j]
  let length = 0
  let openEnded = false
  if (ch === "*" || ch === "+") {
    length = 1
    openEnded = true
  } else if (ch === "?") {
    length = 1
  } else if (ch === "{") {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(j))
    if (!m) return null
    length = m[0].length
    openEnded = m[2] !== undefined && (m[3] === "" || Number(m[3]) > 100)
  } else return null
  if (p[j + length] === "?") length++
  return { length, openEnded }
}

/**
 * Reject regex constructs prone to catastrophic backtracking (the mail engine
 * runs rules on untrusted email): quantified groups that contain quantifiers
 * or alternation (`(a+)+`, `(a|a)*`, `(.*a){8}`), back-references, and
 * patterns with many open-ended repetitions.
 */
export function backtrackingRisk(pattern: string): string | null {
  if (/\\[1-9]|\\k</.test(pattern)) return "Back-references aren't supported in rules"
  const stack: { quantified: boolean; alternation: boolean }[] = [{ quantified: false, alternation: false }]
  let openEnded = 0
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === "\\") {
      i++
      continue
    }
    if (inClass) {
      if (ch === "]") inClass = false
      continue
    }
    if (ch === "[") {
      inClass = true
      continue
    }
    if (ch === "(") {
      stack.push({ quantified: false, alternation: false })
      // skip group modifiers: (?: (?= (?! (?<= (?<! (?<name>
      if (pattern[i + 1] === "?") {
        const m = /^\?(?:[:=!]|<[=!]|<[A-Za-z_][\w]*>)/.exec(pattern.slice(i + 1))
        if (m) i += m[0].length
      }
      continue
    }
    const frame = stack[stack.length - 1]!
    if (ch === "|") {
      frame.alternation = true
      continue
    }
    if (ch === ")") {
      const group = stack.length > 1 ? stack.pop()! : { quantified: false, alternation: false }
      const q = quantifierAt(pattern, i + 1)
      if (q && (group.quantified || group.alternation)) {
        return "Repeated groups containing * + ? or | can make matching extremely slow — simplify the pattern"
      }
      if (group.quantified) stack[stack.length - 1]!.quantified = true
      continue
    }
    const q = quantifierAt(pattern, i)
    if (q) {
      frame.quantified = true
      if (q.openEnded) openEnded++
      i += q.length - 1
    }
  }
  if (openEnded > 4) return "Too many open-ended repetitions (* or +) — simplify the pattern"
  return null
}

/**
 * Validate the structure of a rule (no database lookups). Returns errors keyed
 * by path ("name", "conditions.2.value", "actions.0.labelId" …).
 */
export function validateRuleStructure(input: RuleInput, opts: { allowHttpLocalhost: boolean }): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = input.name.trim()
  if (!name) errors.name = "Give the rule a name"
  else if (name.length > RULE_LIMITS.name) errors.name = `Keep the name under ${RULE_LIMITS.name} characters`
  if (input.description.length > RULE_LIMITS.description) errors.description = "Description is too long"

  if (input.conditions.conditions.length > RULE_LIMITS.conditions) {
    errors.conditions = `A rule can have at most ${RULE_LIMITS.conditions} conditions`
  }
  input.conditions.conditions.forEach((c, i) => {
    const def = CONDITION_FIELDS[c.field]
    if (!def) {
      errors[`conditions.${i}.field`] = "Unknown field"
      return
    }
    if (!def.operators.includes(c.operator)) {
      errors[`conditions.${i}.operator`] = "Choose an operator"
      return
    }
    if (c.field === "header") {
      const h = (c.header ?? "").trim()
      if (!h) errors[`conditions.${i}.header`] = "Header name"
      else if (h.length > RULE_LIMITS.header || !HEADER_RE.test(h)) errors[`conditions.${i}.header`] = "Invalid header name"
    }
    if (def.kind === "boolean") return
    const value = (c.value ?? "").trim()
    if (def.kind === "account" || def.kind === "label") {
      if (!value) errors[`conditions.${i}.value`] = def.kind === "account" ? "Choose an inbox" : "Choose a label"
      return
    }
    if (c.operator === "matches") {
      const err = regexError(c.value ?? "")
      if (err) errors[`conditions.${i}.value`] = err
      return
    }
    if (!value) errors[`conditions.${i}.value`] = "Enter a value"
    else if (value.length > RULE_LIMITS.value) errors[`conditions.${i}.value`] = "Value is too long"
  })

  if (input.actions.length === 0) errors.actions = "Add at least one action"
  else if (input.actions.length > RULE_LIMITS.actions) errors.actions = `A rule can have at most ${RULE_LIMITS.actions} actions`
  const seen = new Set<ActionType>()
  input.actions.forEach((a, i) => {
    const p = `actions.${i}`
    if (PARAMETERLESS_ACTIONS.includes(a.type)) {
      if (seen.has(a.type)) errors[`${p}.type`] = "This action is already in the list"
      seen.add(a.type)
    }
    switch (a.type) {
      case "add_label":
      case "remove_label":
        if (!a.labelId) errors[`${p}.labelId`] = "Choose a label"
        break
      case "assign":
        if (!a.userId) errors[`${p}.userId`] = "Choose a teammate"
        break
      case "assign_team":
        if (!a.teamId) errors[`${p}.teamId`] = "Choose a team"
        break
      case "snooze":
        if (!Number.isInteger(a.minutes) || a.minutes < 1 || a.minutes > RULE_LIMITS.snoozeMinutes) {
          errors[`${p}.minutes`] = "Enter between 1 minute and 1 year"
        }
        break
      case "auto_reply":
        if (a.cannedResponseId) break
        if (!a.body || !a.body.replace(/<[^>]*>/g, "").trim()) errors[`${p}.body`] = "Write a reply or choose a canned response"
        else if (a.body.length > RULE_LIMITS.body) errors[`${p}.body`] = "Reply is too long"
        if (a.subject && a.subject.length > RULE_LIMITS.subject) errors[`${p}.subject`] = "Subject is too long"
        break
      case "forward":
        if (!isValidEmail(a.to.trim())) errors[`${p}.to`] = "Enter a valid email address"
        break
      case "comment":
        if (!a.body.trim()) errors[`${p}.body`] = "Write the comment"
        else if (a.body.length > RULE_LIMITS.comment) errors[`${p}.body`] = "Comment is too long"
        break
      case "webhook": {
        const err = webhookUrlError(a.url, opts.allowHttpLocalhost)
        if (err) errors[`${p}.url`] = err
        break
      }
    }
  })
  return errors
}
