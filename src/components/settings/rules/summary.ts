import {
  CONDITION_FIELDS,
  formatMinutes,
  operatorLabel,
  type RuleAction,
  type RuleCondition,
  type RuleConditions,
  type RuleTrigger,
} from "@/components/settings/rules/definitions"
import type { Locale } from "@/lib/i18n"
import { ruleText } from "@/components/settings/rules/rule-labels"

/** Name lookups used to describe rules in plain language. */
export type RuleLookup = {
  labels: Record<string, string>
  users: Record<string, string>
  teams: Record<string, string>
  accounts: Record<string, string>
  responses: Record<string, string>
}

const quote = (s: string) => `“${s.length > 48 ? `${s.slice(0, 47)}…` : s}”`

export function describeCondition(c: RuleCondition, lookup: RuleLookup, locale: Locale = "en"): string {
  const def = CONDITION_FIELDS[c.field]
  if (!def) return ruleText("unknown condition", locale)
  const field = c.field === "header" ? `${ruleText("header", locale)} ${c.header ?? ""}`.trim() : ruleText(def.label, locale).toLowerCase()
  const op = ruleText(operatorLabel(c.field, c.operator), locale)
  if (c.field === "business_hours") return ruleText(c.operator === "is_true" ? "received during business hours" : "received outside business hours", locale)
  if (def.kind === "boolean") return ruleText(c.operator === "is_true" ? "has an attachment" : "has no attachment", locale)
  if (def.kind === "account") return `${ruleText("inbox", locale)} ${op} ${lookup.accounts[c.value ?? ""] ?? ruleText("(deleted inbox)", locale)}`
  if (def.kind === "label") {
    const name = lookup.labels[c.value ?? ""] ?? ruleText("(deleted label)", locale)
    return `${c.operator === "equals" ? ruleText("has label", locale) : ruleText("doesn't have label", locale)} ${name}`
  }
  return `${field} ${op} ${quote(c.value ?? "")}`
}

export function describeAction(a: RuleAction, lookup: RuleLookup, locale: Locale = "en"): string {
  switch (a.type) {
    case "add_label":
      return `${ruleText("add label", locale)} ${lookup.labels[a.labelId] ?? ruleText("(deleted label)", locale)}`
    case "remove_label":
      return `${ruleText("remove label", locale)} ${lookup.labels[a.labelId] ?? ruleText("(deleted label)", locale)}`
    case "assign":
      return `${ruleText("assign to", locale)} ${lookup.users[a.userId] ?? ruleText("(former member)", locale)}`
    case "assign_team":
      return `${ruleText("assign to", locale)} ${lookup.teams[a.teamId] ?? ruleText("(deleted team)", locale)}${a.balance ? ` (${ruleText("balanced", locale)})` : ""}`
    case "close":
      return ruleText("close", locale)
    case "snooze":
      return `${ruleText("snooze for", locale)} ${formatMinutes(a.minutes)}`
    case "star":
      return ruleText("star", locale)
    case "priority":
      return ruleText("mark as priority", locale)
    case "mark_read":
      return ruleText("mark as read", locale)
    case "mark_spam":
      return ruleText("mark as spam", locale)
    case "trash":
      return ruleText("move to trash", locale)
    case "auto_reply":
      return a.cannedResponseId
        ? `${ruleText("auto-reply with", locale)} ${quote(lookup.responses[a.cannedResponseId] ?? ruleText("deleted response", locale))}`
        : ruleText("send an auto-reply", locale)
    case "forward":
      return `${ruleText("forward to", locale)} ${a.to}`
    case "comment":
      return ruleText("add an internal comment", locale)
    case "webhook": {
      let host = a.url
      try {
        host = new URL(a.url).host
      } catch {
        /* keep raw */
      }
      return `${ruleText("call webhook", locale)} ${host}`
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
  lookup: RuleLookup,
  locale: Locale = "en"
): RuleSummary {
  const trigger = rule.trigger as RuleTrigger
  return {
    when: ruleText(trigger === "outgoing" ? "When an email is sent" : "When an email arrives", locale),
    conditions: (rule.conditions?.conditions ?? []).map((c) => describeCondition(c, lookup, locale)),
    joiner: rule.conditions?.match === "any" ? "or" : "and",
    actions: (rule.actions ?? []).map((a) => describeAction(a, lookup, locale)),
  }
}

/** One-line sentence: "When an email arrives and from contains “x” → add label Billing, close". */
export function ruleSentence(rule: { trigger: string; conditions: RuleConditions; actions: RuleAction[] }, lookup: RuleLookup) {
  const s = summarizeRule(rule, lookup)
  const cond = s.conditions.length ? ` and ${s.conditions.join(` ${s.joiner} `)}` : ""
  const acts = s.actions.length ? s.actions.join(", ") : "do nothing"
  return `${s.when}${cond} → ${acts}`
}
