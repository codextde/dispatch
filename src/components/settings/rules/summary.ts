import {
  CONDITION_FIELDS,
  formatMinutes,
  operatorLabel,
  type RuleAction,
  type RuleCondition,
  type RuleConditions,
  type RuleTrigger,
} from "@/components/settings/rules/definitions"

/** Name lookups used to describe rules in plain language. */
export type RuleLookup = {
  labels: Record<string, string>
  users: Record<string, string>
  teams: Record<string, string>
  accounts: Record<string, string>
  responses: Record<string, string>
}

const quote = (s: string) => `“${s.length > 48 ? `${s.slice(0, 47)}…` : s}”`

export function describeCondition(c: RuleCondition, lookup: RuleLookup): string {
  const def = CONDITION_FIELDS[c.field]
  if (!def) return "unknown condition"
  const field = c.field === "header" ? `header ${c.header ?? ""}`.trim() : def.label.toLowerCase()
  const op = operatorLabel(c.field, c.operator)
  if (c.field === "business_hours") return c.operator === "is_true" ? "received during business hours" : "received outside business hours"
  if (def.kind === "boolean") return c.operator === "is_true" ? "has an attachment" : "has no attachment"
  if (def.kind === "account") return `inbox ${op} ${lookup.accounts[c.value ?? ""] ?? "(deleted inbox)"}`
  if (def.kind === "label") {
    const name = lookup.labels[c.value ?? ""] ?? "(deleted label)"
    return c.operator === "equals" ? `has label ${name}` : `doesn't have label ${name}`
  }
  return `${field} ${op} ${quote(c.value ?? "")}`
}

export function describeAction(a: RuleAction, lookup: RuleLookup): string {
  switch (a.type) {
    case "add_label":
      return `add label ${lookup.labels[a.labelId] ?? "(deleted label)"}`
    case "remove_label":
      return `remove label ${lookup.labels[a.labelId] ?? "(deleted label)"}`
    case "assign":
      return `assign to ${lookup.users[a.userId] ?? "(former member)"}`
    case "assign_team":
      return `assign to ${lookup.teams[a.teamId] ?? "(deleted team)"}${a.balance ? " (balanced)" : ""}`
    case "close":
      return "close"
    case "snooze":
      return `snooze for ${formatMinutes(a.minutes)}`
    case "star":
      return "star"
    case "priority":
      return "mark as priority"
    case "mark_read":
      return "mark as read"
    case "mark_spam":
      return "mark as spam"
    case "trash":
      return "move to trash"
    case "auto_reply":
      return a.cannedResponseId
        ? `auto-reply with ${quote(lookup.responses[a.cannedResponseId] ?? "deleted response")}`
        : "send an auto-reply"
    case "forward":
      return `forward to ${a.to}`
    case "comment":
      return "add an internal comment"
    case "webhook": {
      let host = a.url
      try {
        host = new URL(a.url).host
      } catch {
        /* keep raw */
      }
      return `call webhook ${host}`
    }
  }
}

export type RuleSummary = {
  when: string
  conditions: string[]
  joiner: "and" | "or"
  actions: string[]
}

export function summarizeRule(
  rule: { trigger: string; conditions: RuleConditions; actions: RuleAction[] },
  lookup: RuleLookup
): RuleSummary {
  const trigger = rule.trigger as RuleTrigger
  return {
    when: trigger === "outgoing" ? "When an email is sent" : "When an email arrives",
    conditions: (rule.conditions?.conditions ?? []).map((c) => describeCondition(c, lookup)),
    joiner: rule.conditions?.match === "any" ? "or" : "and",
    actions: (rule.actions ?? []).map((a) => describeAction(a, lookup)),
  }
}

/** One-line sentence: "When an email arrives and from contains “x” → add label Billing, close". */
export function ruleSentence(rule: { trigger: string; conditions: RuleConditions; actions: RuleAction[] }, lookup: RuleLookup) {
  const s = summarizeRule(rule, lookup)
  const cond = s.conditions.length ? ` and ${s.conditions.join(` ${s.joiner} `)}` : ""
  const acts = s.actions.length ? s.actions.join(", ") : "do nothing"
  return `${s.when}${cond} → ${acts}`
}
