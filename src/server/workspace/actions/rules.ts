"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import * as rules from "@/server/workspace/services/rules"
import type { RuleInput } from "@/components/settings/rules/definitions"

const slug = z.string().min(1).max(100)
const id = z.guid()
const scope = z.enum(["workspace", "personal"])
const text = (max: number) => z.string().max(max)

const condition = z.object({
  field: z.enum(["from", "to", "cc", "subject", "body", "account", "has_attachment", "header", "label", "domain", "business_hours"]),
  operator: z.enum(["contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "matches", "is_true", "is_false"]),
  value: text(2000).optional(),
  header: text(200).optional(),
})

const ruleAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_label"), labelId: z.string().max(64) }),
  z.object({ type: z.literal("remove_label"), labelId: z.string().max(64) }),
  z.object({ type: z.literal("assign"), userId: z.string().max(64) }),
  z.object({ type: z.literal("assign_team"), teamId: z.string().max(64), balance: z.boolean().optional() }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("mark_spam") }),
  z.object({ type: z.literal("trash") }),
  z.object({ type: z.literal("star") }),
  z.object({ type: z.literal("priority") }),
  z.object({ type: z.literal("mark_read") }),
  z.object({ type: z.literal("snooze"), minutes: z.number() }),
  z.object({
    type: z.literal("auto_reply"),
    cannedResponseId: z.string().max(64).optional(),
    body: text(40_000).optional(),
    subject: text(500).optional(),
  }),
  z.object({ type: z.literal("forward"), to: text(500) }),
  z.object({ type: z.literal("comment"), body: text(10_000) }),
  z.object({ type: z.literal("webhook"), url: text(4000) }),
])

/** Rule fields live at the top level so validation paths match the builder ("actions.0.labelId"). */
const ruleFields = {
  name: text(500),
  description: text(2000).default(""),
  trigger: z.enum(["incoming", "outgoing"]),
  enabled: z.boolean(),
  accountIds: z.array(id).max(500),
  conditions: z.object({ match: z.enum(["all", "any"]), conditions: z.array(condition).max(100) }),
  actions: z.array(ruleAction).max(100),
  stopProcessing: z.boolean(),
}

function pickRule(input: z.infer<z.ZodObject<typeof ruleFields>>): RuleInput {
  return {
    name: input.name,
    description: input.description,
    trigger: input.trigger,
    enabled: input.enabled,
    accountIds: input.accountIds,
    conditions: input.conditions,
    actions: input.actions,
    stopProcessing: input.stopProcessing,
  }
}

export const createRule = action(z.object({ slug, scope, ...ruleFields }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const rule = await rules.createRule(ctx, input.scope, pickRule(input))
  await auditAction(ctx, "rule.created", { type: "rule", id: rule.id }, { name: rule.name, scope: rule.scope })
  revalidateSettings()
  return { id: rule.id }
})

export const updateRule = action(z.object({ slug, id, ...ruleFields }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const rule = await rules.updateRule(ctx, input.id, pickRule(input))
  await auditAction(ctx, "rule.updated", { type: "rule", id: rule.id }, { name: rule.name, scope: rule.scope })
  revalidateSettings()
  return { id: rule.id }
})

export const toggleRule = action(z.object({ slug, id, enabled: z.boolean() }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const rule = await rules.setRuleEnabled(ctx, input.id, input.enabled)
  await auditAction(ctx, "rule.toggled", { type: "rule", id: rule.id }, { name: rule.name, scope: rule.scope, enabled: input.enabled })
  revalidateSettings()
  return { id: rule.id, enabled: input.enabled }
})

export const reorderRules = action(z.object({ slug, scope, ids: z.array(id).max(1000) }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const res = await rules.reorderRules(ctx, input.scope, input.ids)
  await auditAction(ctx, "rule.reordered", null, { scope: input.scope, count: res.count })
  revalidateSettings()
  return res
})

export const deleteRule = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const rule = await rules.deleteRule(ctx, input.id)
  await auditAction(ctx, "rule.deleted", { type: "rule", id: rule.id }, { name: rule.name, scope: rule.scope })
  revalidateSettings()
  return { id: rule.id }
})

export const duplicateRule = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug)
  const rule = await rules.duplicateRule(ctx, input.id)
  await auditAction(ctx, "rule.created", { type: "rule", id: rule.id }, { name: rule.name, scope: rule.scope, duplicatedFrom: rule.sourceId })
  revalidateSettings()
  return { id: rule.id }
})

export const createRuleFromTemplate = action(
  z.object({ slug, scope, templateId: z.enum(rules.RULE_TEMPLATE_IDS as [rules.RuleTemplateId, ...rules.RuleTemplateId[]]) }),
  async (input) => {
    const ctx = await workspaceAction(input.slug)
    const rule = await rules.createRuleFromTemplate(ctx, input.scope, input.templateId)
    await auditAction(ctx, "rule.created", { type: "rule", id: rule.id }, {
      name: rule.name,
      scope: rule.scope,
      template: input.templateId,
      createdLabels: rule.createdLabels,
    })
    if (rule.createdLabels.length) await publish({ orgId: ctx.org.id, type: "labels.updated", actorId: ctx.user.id })
    revalidateSettings()
    return { id: rule.id, createdLabels: rule.createdLabels }
  }
)
