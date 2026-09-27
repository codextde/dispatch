import {
  CONDITION_FIELDS,
  type ActionType,
  type ConditionField,
  type ConditionOperator,
  type RuleAction,
  type RuleCondition,
  type RuleInput,
  type RuleTrigger,
} from "@/components/settings/rules/definitions"

/** Editable (flat) representations of conditions and actions used by the builder. */

export type ConditionDraft = {
  key: string
  field: ConditionField
  operator: ConditionOperator
  value: string
  header: string
}

export type ActionDraft = {
  key: string
  type: ActionType
  labelId: string
  userId: string
  teamId: string
  balance: boolean
  minutes: number
  replyMode: "canned" | "custom"
  cannedResponseId: string
  subject: string
  body: string
  to: string
  url: string
}

export type RuleDraft = {
  name: string
  description: string
  trigger: RuleTrigger
  enabled: boolean
  accountIds: string[]
  match: "all" | "any"
  conditions: ConditionDraft[]
  actions: ActionDraft[]
  stopProcessing: boolean
}

let seq = 0
export const newKey = () => `k${++seq}`

export function newCondition(field: ConditionField = "from"): ConditionDraft {
  return { key: newKey(), field, operator: CONDITION_FIELDS[field].operators[0]!, value: "", header: "" }
}

export function conditionFromRule(c: RuleCondition): ConditionDraft {
  return { key: newKey(), field: c.field, operator: c.operator, value: c.value ?? "", header: c.header ?? "" }
}

export function conditionToRule(d: ConditionDraft): RuleCondition {
  const kind = CONDITION_FIELDS[d.field].kind
  if (kind === "boolean") return { field: d.field, operator: d.operator }
  if (d.field === "header") return { field: "header", header: d.header, operator: d.operator, value: d.value }
  return { field: d.field, operator: d.operator, value: d.value }
}

export function newAction(type: ActionType): ActionDraft {
  return {
    key: newKey(),
    type,
    labelId: "",
    userId: "",
    teamId: "",
    balance: type === "assign_team",
    minutes: 240,
    replyMode: "custom",
    cannedResponseId: "",
    subject: "",
    body: "",
    to: "",
    url: "",
  }
}

export function actionFromRule(a: RuleAction): ActionDraft {
  const d = newAction(a.type)
  switch (a.type) {
    case "add_label":
    case "remove_label":
      return { ...d, labelId: a.labelId }
    case "assign":
      return { ...d, userId: a.userId }
    case "assign_team":
      return { ...d, teamId: a.teamId, balance: Boolean(a.balance) }
    case "snooze":
      return { ...d, minutes: a.minutes }
    case "auto_reply":
      return a.cannedResponseId
        ? { ...d, replyMode: "canned", cannedResponseId: a.cannedResponseId }
        : { ...d, replyMode: "custom", subject: a.subject ?? "", body: a.body ?? "" }
    case "forward":
      return { ...d, to: a.to }
    case "comment":
      return { ...d, body: a.body }
    case "webhook":
      return { ...d, url: a.url }
    default:
      return d
  }
}

export function actionToRule(d: ActionDraft): RuleAction {
  switch (d.type) {
    case "add_label":
    case "remove_label":
      return { type: d.type, labelId: d.labelId }
    case "assign":
      return { type: "assign", userId: d.userId }
    case "assign_team":
      return { type: "assign_team", teamId: d.teamId, balance: d.balance }
    case "snooze":
      return { type: "snooze", minutes: d.minutes }
    case "auto_reply":
      return d.replyMode === "canned"
        ? { type: "auto_reply", cannedResponseId: d.cannedResponseId }
        : { type: "auto_reply", body: d.body, ...(d.subject.trim() ? { subject: d.subject } : {}) }
    case "forward":
      return { type: "forward", to: d.to }
    case "comment":
      return { type: "comment", body: d.body }
    case "webhook":
      return { type: "webhook", url: d.url }
    default:
      return { type: d.type }
  }
}

export type InitialRule = Pick<
  RuleInput,
  "name" | "trigger" | "enabled" | "accountIds" | "conditions" | "actions" | "stopProcessing"
> & { description: string | null }

export function draftFromRule(rule: InitialRule | null): RuleDraft {
  if (!rule) {
    return {
      name: "",
      description: "",
      trigger: "incoming",
      enabled: true,
      accountIds: [],
      match: "all",
      conditions: [newCondition("from")],
      actions: [],
      stopProcessing: false,
    }
  }
  return {
    name: rule.name,
    description: rule.description ?? "",
    trigger: rule.trigger === "outgoing" ? "outgoing" : "incoming",
    enabled: rule.enabled,
    accountIds: rule.accountIds,
    match: rule.conditions?.match === "any" ? "any" : "all",
    conditions: (rule.conditions?.conditions ?? []).map(conditionFromRule),
    actions: (rule.actions ?? []).map(actionFromRule),
    stopProcessing: rule.stopProcessing,
  }
}

export function draftToInput(d: RuleDraft): RuleInput {
  return {
    name: d.name,
    description: d.description,
    trigger: d.trigger,
    enabled: d.enabled,
    accountIds: d.accountIds,
    conditions: { match: d.match, conditions: d.conditions.map(conditionToRule) },
    actions: d.actions.map(actionToRule),
    stopProcessing: d.stopProcessing,
  }
}
