import "server-only"
import net from "node:net"
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { AuthError, type OrgContext } from "@/server/authz"
import { isPrivateAddress } from "@/server/mail/ip-ranges"
import { isPrivateNetworkBlocked } from "@/server/mail/net-guard"
import { sanitizeRichText } from "@/server/workspace/html"
import { filterMemberIds } from "@/server/workspace/queries/common"
import { usableSharedResponsesWhere, userTeamIds } from "@/server/workspace/response-access"
import {
  CONDITION_FIELDS,
  validateRuleStructure,
  type RuleAction,
  type RuleCondition,
  type RuleInput,
  type RuleScope,
} from "@/components/settings/rules/definitions"

/**
 * Rules service: validation, persistence and templates for automation rules.
 * Plain functions taking an org context so they can be tested outside a
 * request; server actions in src/server/workspace/actions/rules.ts wrap them.
 *
 *  - Workspace rules (ownerUserId null) require `rules.manage` and target
 *    shared inboxes / shared labels.
 *  - Personal rules (ownerUserId = me) require `inboxes.connect_personal` and
 *    target my personal inboxes; they may use shared labels and my private
 *    labels, and shared or my own canned responses.
 */

export type RuleCtx = Pick<OrgContext, "org" | "user" | "permissions">
type RuleRow = typeof schema.rules.$inferSelect

export function canUseScope(ctx: Pick<OrgContext, "permissions">, scope: RuleScope) {
  return ctx.permissions.has(scope === "workspace" ? "rules.manage" : "inboxes.connect_personal")
}

export function assertScope(ctx: Pick<OrgContext, "permissions">, scope: RuleScope) {
  if (!canUseScope(ctx, scope)) {
    throw new AuthError(403, scope === "workspace" ? "Missing permission: rules.manage" : "Missing permission: inboxes.connect_personal")
  }
}

export function ruleScope(rule: Pick<RuleRow, "ownerUserId">): RuleScope {
  return rule.ownerUserId ? "personal" : "workspace"
}

function scopeWhere(ctx: RuleCtx, scope: RuleScope) {
  return and(
    eq(schema.rules.orgId, ctx.org.id),
    scope === "workspace" ? isNull(schema.rules.ownerUserId) : eq(schema.rules.ownerUserId, ctx.user.id)
  )
}

/** Load a rule the current member may manage, or throw 404. */
export async function getManageableRule(ctx: RuleCtx, id: string): Promise<RuleRow> {
  const [rule] = await db
    .select()
    .from(schema.rules)
    .where(and(eq(schema.rules.id, id), eq(schema.rules.orgId, ctx.org.id)))
    .limit(1)
  if (!rule) throw new AuthError(404, "Rule not found")
  if (rule.ownerUserId) {
    if (rule.ownerUserId !== ctx.user.id) throw new AuthError(404, "Rule not found")
  }
  assertScope(ctx, ruleScope(rule))
  return rule
}

/** Throw a validation error whose keys become `fieldErrors` in the ActionResult. */
export function validationError(errors: Record<string, string>): never {
  throw new z.ZodError(
    Object.entries(errors).map(([key, message]) => ({
      code: "custom" as const,
      path: key.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)),
      message,
      input: undefined,
    }))
  )
}

/* -------------------------------------------------------------------------- */
/*                         Allowed references per scope                        */
/* -------------------------------------------------------------------------- */

async function allowedAccountIds(ctx: RuleCtx, scope: RuleScope) {
  const a = schema.accounts
  const rows = await db
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.orgId, ctx.org.id), scope === "workspace" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)))
  return new Set(rows.map((r) => r.id))
}

async function allowedLabelIds(ctx: RuleCtx, scope: RuleScope, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const l = schema.labels
  const rows = await db
    .select({ id: l.id })
    .from(l)
    .where(
      and(
        eq(l.orgId, ctx.org.id),
        inArray(l.id, ids),
        scope === "workspace" ? eq(l.visibility, "shared") : or(eq(l.visibility, "shared"), eq(l.ownerUserId, ctx.user.id))
      )
    )
  return new Set(rows.map((r) => r.id))
}

async function allowedTeamIds(ctx: RuleCtx, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const rows = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(and(eq(schema.teams.orgId, ctx.org.id), inArray(schema.teams.id, ids)))
  return new Set(rows.map((r) => r.id))
}

/** Responses the actor may use: team responses only for their teams (or response managers). */
async function allowedResponseIds(ctx: RuleCtx, scope: RuleScope, ids: string[]) {
  if (!ids.length) return new Set<string>()
  const c = schema.cannedResponses
  const shared = usableSharedResponsesWhere({
    canManage: ctx.permissions.has("responses.manage"),
    teamIds: await userTeamIds(ctx.org.id, ctx.user.id),
  })
  const rows = await db
    .select({ id: c.id })
    .from(c)
    .where(and(eq(c.orgId, ctx.org.id), inArray(c.id, ids), scope === "workspace" ? shared : or(shared, eq(c.ownerUserId, ctx.user.id))))
  return new Set(rows.map((r) => r.id))
}

/** Private / loopback hosts (IP literals and well-known local names). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true
  // IP literals: the same ranges the delivery-time guard refuses (src/server/mail/ip-ranges.ts)
  return net.isIP(h) !== 0 && isPrivateAddress(h)
}

/* -------------------------------------------------------------------------- */
/*                               Normalization                                */
/* -------------------------------------------------------------------------- */

export type NormalizedRule = Omit<RuleInput, "description"> & { description: string | null }

function cleanCondition(c: RuleCondition): RuleCondition {
  const kind = CONDITION_FIELDS[c.field].kind
  if (kind === "boolean") return { field: c.field, operator: c.operator }
  const value = c.operator === "matches" ? (c.value ?? "") : (c.value ?? "").trim()
  if (c.field === "header") return { field: "header", operator: c.operator, header: (c.header ?? "").trim(), value }
  return { field: c.field, operator: c.operator, value }
}

function cleanAction(a: RuleAction): RuleAction {
  switch (a.type) {
    case "add_label":
    case "remove_label":
      return { type: a.type, labelId: a.labelId }
    case "assign":
      return { type: "assign", userId: a.userId }
    case "assign_team":
      return { type: "assign_team", teamId: a.teamId, balance: Boolean(a.balance) }
    case "snooze":
      return { type: "snooze", minutes: a.minutes }
    case "auto_reply":
      if (a.cannedResponseId) return { type: "auto_reply", cannedResponseId: a.cannedResponseId }
      return {
        type: "auto_reply",
        body: sanitizeRichText(a.body ?? ""),
        ...(a.subject?.trim() ? { subject: a.subject.trim() } : {}),
      }
    case "forward":
      return { type: "forward", to: a.to.trim().toLowerCase() }
    case "comment":
      return { type: "comment", body: a.body.trim() }
    case "webhook":
      return { type: "webhook", url: a.url.trim() }
    default:
      return { type: a.type }
  }
}

/**
 * Validate structure and references of a rule for `scope` and return a clean
 * copy ready to store. Throws a ZodError (→ fieldErrors) on problems.
 */
export async function normalizeRule(ctx: RuleCtx, scope: RuleScope, input: RuleInput): Promise<NormalizedRule> {
  const allowHttpLocalhost = process.env.NODE_ENV !== "production"
  const errors = validateRuleStructure(input, { allowHttpLocalhost })

  const blockPrivate = await isPrivateNetworkBlocked()
  input.actions.forEach((a, i) => {
    if (a.type !== "webhook" || errors[`actions.${i}.url`]) return
    if (blockPrivate && isPrivateHost(new URL(a.url.trim()).hostname)) {
      errors[`actions.${i}.url`] = "Private network addresses are blocked on this instance"
    }
  })

  const accounts = await allowedAccountIds(ctx, scope)
  const accountIds = [...new Set(input.accountIds)]
  if (accountIds.some((id) => !accounts.has(id))) {
    errors.accountIds = scope === "workspace" ? "Choose shared inboxes of this workspace" : "Choose your own personal inboxes"
  }

  const labelIds: string[] = []
  const userIds: string[] = []
  const teamIds: string[] = []
  const responseIds: string[] = []
  for (const c of input.conditions.conditions) if (c.field === "label" && c.value) labelIds.push(c.value)
  for (const a of input.actions) {
    if ((a.type === "add_label" || a.type === "remove_label") && a.labelId) labelIds.push(a.labelId)
    if (a.type === "assign" && a.userId) userIds.push(a.userId)
    if (a.type === "assign_team" && a.teamId) teamIds.push(a.teamId)
    if (a.type === "auto_reply" && a.cannedResponseId) responseIds.push(a.cannedResponseId)
  }
  const [labels, members, teams, responses] = await Promise.all([
    allowedLabelIds(ctx, scope, labelIds),
    filterMemberIds(ctx.org.id, userIds).then((ids) => new Set(ids)),
    allowedTeamIds(ctx, teamIds),
    allowedResponseIds(ctx, scope, responseIds),
  ])

  input.conditions.conditions.forEach((c, i) => {
    const key = `conditions.${i}.value`
    if (errors[key] || !c.value) return
    if (c.field === "account" && !accounts.has(c.value)) errors[key] = "This inbox isn't available for this rule"
    if (c.field === "label" && !labels.has(c.value)) errors[key] = "This label isn't available for this rule"
  })
  input.actions.forEach((a, i) => {
    const p = `actions.${i}`
    if ((a.type === "add_label" || a.type === "remove_label") && a.labelId && !labels.has(a.labelId)) {
      errors[`${p}.labelId`] = scope === "workspace" ? "Workspace rules can only use shared labels" : "This label isn't available"
    }
    if (a.type === "assign" && a.userId && !members.has(a.userId)) errors[`${p}.userId`] = "This person isn't an active member"
    if (a.type === "assign_team" && a.teamId && !teams.has(a.teamId)) errors[`${p}.teamId`] = "This team no longer exists"
    if (a.type === "auto_reply" && a.cannedResponseId && !responses.has(a.cannedResponseId)) {
      errors[`${p}.cannedResponseId`] = "This canned response isn't available"
    }
  })

  if (Object.keys(errors).length) validationError(errors)

  const actions = input.actions.map(cleanAction)
  actions.forEach((a, i) => {
    if (a.type === "auto_reply" && !a.cannedResponseId && !a.body?.replace(/<[^>]*>/g, "").trim()) {
      validationError({ [`actions.${i}.body`]: "Write a reply or choose a canned response" })
    }
  })

  return {
    name: input.name.trim(),
    description: input.description.trim() || null,
    trigger: input.trigger,
    enabled: input.enabled,
    accountIds,
    conditions: { match: input.conditions.match, conditions: input.conditions.conditions.map(cleanCondition) },
    actions,
    stopProcessing: input.stopProcessing,
  }
}

async function nextPosition(ctx: RuleCtx, scope: RuleScope) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${schema.rules.position})` })
    .from(schema.rules)
    .where(scopeWhere(ctx, scope))
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}

/* -------------------------------------------------------------------------- */
/*                                  Mutations                                 */
/* -------------------------------------------------------------------------- */

export async function createRule(ctx: RuleCtx, scope: RuleScope, input: RuleInput) {
  assertScope(ctx, scope)
  const rule = await normalizeRule(ctx, scope, input)
  const [row] = await db
    .insert(schema.rules)
    .values({
      orgId: ctx.org.id,
      ownerUserId: scope === "personal" ? ctx.user.id : null,
      ...rule,
      position: await nextPosition(ctx, scope),
      createdBy: ctx.user.id,
    })
    .returning({ id: schema.rules.id, name: schema.rules.name })
  return { ...row!, scope }
}

export async function updateRule(ctx: RuleCtx, id: string, input: RuleInput) {
  const existing = await getManageableRule(ctx, id)
  const scope = ruleScope(existing)
  const rule = await normalizeRule(ctx, scope, input)
  await db
    .update(schema.rules)
    .set(rule)
    .where(and(eq(schema.rules.id, existing.id), eq(schema.rules.orgId, ctx.org.id)))
  return { id: existing.id, name: rule.name, scope, enabledChanged: existing.enabled !== rule.enabled }
}

export async function setRuleEnabled(ctx: RuleCtx, id: string, enabled: boolean) {
  const rule = await getManageableRule(ctx, id)
  await db
    .update(schema.rules)
    .set({ enabled })
    .where(and(eq(schema.rules.id, rule.id), eq(schema.rules.orgId, ctx.org.id)))
  return { id: rule.id, name: rule.name, scope: ruleScope(rule) }
}

/**
 * Persist the order of rules in a scope. `ids` is the new order; rules of the
 * scope missing from `ids` (e.g. created concurrently) keep their relative
 * order after the given ones.
 */
export async function reorderRules(ctx: RuleCtx, scope: RuleScope, ids: string[]) {
  assertScope(ctx, scope)
  const current = await db
    .select({ id: schema.rules.id })
    .from(schema.rules)
    .where(scopeWhere(ctx, scope))
    .orderBy(asc(schema.rules.position), asc(schema.rules.createdAt))
  const known = new Set(current.map((r) => r.id))
  const unique = [...new Set(ids)]
  if (unique.some((id) => !known.has(id))) throw new AuthError(404, "Rule not found — refresh and try again")
  const ordered = [...unique, ...current.map((r) => r.id).filter((id) => !unique.includes(id))]
  await db.transaction(async (tx) => {
    for (const [position, id] of ordered.entries()) {
      await tx
        .update(schema.rules)
        .set({ position })
        .where(and(eq(schema.rules.id, id), eq(schema.rules.orgId, ctx.org.id)))
    }
  })
  return { count: ordered.length }
}

export async function deleteRule(ctx: RuleCtx, id: string) {
  const rule = await getManageableRule(ctx, id)
  await db.delete(schema.rules).where(and(eq(schema.rules.id, rule.id), eq(schema.rules.orgId, ctx.org.id)))
  return { id: rule.id, name: rule.name, scope: ruleScope(rule) }
}

export async function duplicateRule(ctx: RuleCtx, id: string) {
  const rule = await getManageableRule(ctx, id)
  const scope = ruleScope(rule)
  const name = `${rule.name.slice(0, 110)} (copy)`
  const [row] = await db
    .insert(schema.rules)
    .values({
      orgId: ctx.org.id,
      ownerUserId: rule.ownerUserId,
      name,
      description: rule.description,
      enabled: false,
      trigger: rule.trigger,
      conditions: rule.conditions,
      actions: rule.actions,
      accountIds: rule.accountIds,
      stopProcessing: rule.stopProcessing,
      position: await nextPosition(ctx, scope),
      createdBy: ctx.user.id,
    })
    .returning({ id: schema.rules.id })
  return { id: row!.id, name, sourceId: rule.id, scope }
}

/* -------------------------------------------------------------------------- */
/*                                  Templates                                 */
/* -------------------------------------------------------------------------- */

export type RuleTemplateId =
  | "billing-to-finance"
  | "support-round-robin"
  | "vip-customers"
  | "after-hours-reply"
  | "newsletters-read"

export const RULE_TEMPLATE_IDS: RuleTemplateId[] = [
  "billing-to-finance",
  "support-round-robin",
  "vip-customers",
  "after-hours-reply",
  "newsletters-read",
]

export type RuleTemplateInfo = {
  id: RuleTemplateId
  name: string
  description: string
  available: boolean
  hint?: string
}

const TEMPLATE_LABELS: Partial<Record<RuleTemplateId, { name: string; color: string }>> = {
  "billing-to-finance": { name: "Billing", color: "#f59e0b" },
  "vip-customers": { name: "VIP", color: "#ec4899" },
  "newsletters-read": { name: "Newsletter", color: "#0ea5e9" },
}

const AFTER_HOURS_BODY =
  "<p>Hi {{contact.first_name}},</p><p>Thanks for your message! Our team is currently outside business hours, so we'll get back to you as soon as we're back online.</p><p>Best regards,<br>{{org.name}}</p>"

async function findLabel(ctx: RuleCtx, scope: RuleScope, name: string) {
  const l = schema.labels
  const rows = await db
    .select({ id: l.id, visibility: l.visibility })
    .from(l)
    .where(
      and(
        eq(l.orgId, ctx.org.id),
        sql`lower(${l.name}) = ${name.toLowerCase()}`,
        scope === "workspace" ? eq(l.visibility, "shared") : or(eq(l.visibility, "shared"), eq(l.ownerUserId, ctx.user.id))
      )
    )
    .orderBy(asc(l.createdAt))
  // Prefer the shared label when both exist
  return rows.find((r) => r.visibility === "shared") ?? rows[0] ?? null
}

async function findTeam(ctx: RuleCtx, pattern: string | null) {
  const t = schema.teams
  const rows = await db
    .select({ id: t.id, name: t.name })
    .from(t)
    .where(and(eq(t.orgId, ctx.org.id), pattern ? sql`${t.name} ilike ${pattern}` : undefined))
    .orderBy(asc(t.name))
    .limit(1)
  return rows[0] ?? null
}

/** Templates available in `scope`, with the reason when one can't be used. */
export async function listRuleTemplates(ctx: RuleCtx, scope: RuleScope): Promise<RuleTemplateInfo[]> {
  const canCreateSharedLabels = ctx.permissions.has("labels.manage")
  const [anyTeam, finance, ...labels] = await Promise.all([
    findTeam(ctx, null),
    findTeam(ctx, "finance"),
    ...(["Billing", "VIP", "Newsletter"] as const).map((n) => findLabel(ctx, scope, n)),
  ])
  const labelExists: Record<string, boolean> = { Billing: !!labels[0], VIP: !!labels[1], Newsletter: !!labels[2] }
  const labelHint = (id: RuleTemplateId) => {
    const l = TEMPLATE_LABELS[id]
    if (!l || scope === "personal" || labelExists[l.name] || canCreateSharedLabels) return undefined
    return `Needs a shared “${l.name}” label — ask someone who can manage labels to create it.`
  }

  const all: (RuleTemplateInfo & { scopes: RuleScope[] })[] = [
    {
      id: "billing-to-finance",
      scopes: ["workspace", "personal"],
      name: scope === "workspace" ? "Route billing emails to Finance" : "Label billing emails",
      description:
        scope === "workspace"
          ? `Label invoices and billing questions${finance ? ` and assign them to ${finance.name}` : ""}.`
          : "Label invoices and billing questions so they're easy to find.",
      available: !labelHint("billing-to-finance"),
      hint: labelHint("billing-to-finance"),
    },
    {
      id: "support-round-robin",
      scopes: ["workspace"],
      name: "Auto-assign support emails round-robin",
      description: "Spread emails sent to support@ evenly across a team.",
      available: Boolean(anyTeam),
      hint: anyTeam ? undefined : "Create a team first (Settings → Teams).",
    },
    {
      id: "vip-customers",
      scopes: ["workspace", "personal"],
      name: "Label VIP customers",
      description: "Flag emails from your key customers' domains as priority.",
      available: !labelHint("vip-customers"),
      hint: labelHint("vip-customers"),
    },
    {
      id: "after-hours-reply",
      scopes: ["workspace", "personal"],
      name: "Auto-reply outside business hours",
      description: "Let people know when to expect an answer.",
      available: true,
    },
    {
      id: "newsletters-read",
      scopes: ["workspace", "personal"],
      name: "Mark newsletters as read",
      description: "Keep mailing lists labeled and out of the way.",
      available: !labelHint("newsletters-read"),
      hint: labelHint("newsletters-read"),
    },
  ]
  return all
    .filter((t) => t.scopes.includes(scope))
    .map((t) => ({ id: t.id, name: t.name, description: t.description, available: t.available, hint: t.hint }))
}

async function ensureLabel(ctx: RuleCtx, scope: RuleScope, name: string, color: string, created: string[]) {
  const existing = await findLabel(ctx, scope, name)
  if (existing) return existing.id
  if (scope === "workspace" && !ctx.permissions.has("labels.manage")) {
    throw new AuthError(403, `A shared “${name}” label is required — ask someone who can manage labels to create it.`)
  }
  const [pos] = await db
    .select({ max: sql<number | null>`max(${schema.labels.position})` })
    .from(schema.labels)
    .where(eq(schema.labels.orgId, ctx.org.id))
  const [label] = await db
    .insert(schema.labels)
    .values({
      orgId: ctx.org.id,
      name,
      color,
      visibility: scope === "workspace" ? "shared" : "private",
      ownerUserId: scope === "workspace" ? null : ctx.user.id,
      position: pos?.max === null || pos?.max === undefined ? 0 : Number(pos.max) + 1,
    })
    .returning({ id: schema.labels.id })
  created.push(name)
  return label!.id
}

/** Create a rule from a template (creating missing labels) and return its id. */
export async function createRuleFromTemplate(ctx: RuleCtx, scope: RuleScope, templateId: RuleTemplateId) {
  assertScope(ctx, scope)
  const info = (await listRuleTemplates(ctx, scope)).find((t) => t.id === templateId)
  if (!info) throw new AuthError(404, "Template not found")
  if (!info.available) throw new AuthError(403, info.hint ?? "This template isn't available")

  const createdLabels: string[] = []
  const base: RuleInput = {
    name: info.name,
    description: "",
    trigger: "incoming",
    enabled: true,
    accountIds: [],
    conditions: { match: "all", conditions: [] },
    actions: [],
    stopProcessing: false,
  }
  let input: RuleInput
  switch (templateId) {
    case "billing-to-finance": {
      const labelId = await ensureLabel(ctx, scope, "Billing", TEMPLATE_LABELS[templateId]!.color, createdLabels)
      const finance = scope === "workspace" ? await findTeam(ctx, "finance") : null
      input = {
        ...base,
        description: "Invoices, receipts and billing questions.",
        conditions: {
          match: "any",
          conditions: [
            { field: "subject", operator: "contains", value: "invoice" },
            { field: "subject", operator: "contains", value: "billing" },
            { field: "body", operator: "contains", value: "invoice" },
            { field: "body", operator: "contains", value: "billing" },
          ],
        },
        actions: [
          { type: "add_label", labelId },
          ...(finance ? [{ type: "assign_team" as const, teamId: finance.id, balance: false }] : []),
        ],
      }
      break
    }
    case "support-round-robin": {
      const team = (await findTeam(ctx, "%support%")) ?? (await findTeam(ctx, null))
      if (!team) throw new AuthError(403, "Create a team first (Settings → Teams).")
      input = {
        ...base,
        description: `Assigns new support emails to members of ${team.name} in turn.`,
        conditions: { match: "all", conditions: [{ field: "to", operator: "contains", value: "support@" }] },
        actions: [{ type: "assign_team", teamId: team.id, balance: true }],
      }
      break
    }
    case "vip-customers": {
      const labelId = await ensureLabel(ctx, scope, "VIP", TEMPLATE_LABELS[templateId]!.color, createdLabels)
      input = {
        ...base,
        // Placeholder domain: created disabled so it can be customized first
        enabled: false,
        description: "Replace example.com with your key customers' domains, then enable the rule.",
        conditions: { match: "any", conditions: [{ field: "domain", operator: "equals", value: "example.com" }] },
        actions: [{ type: "add_label", labelId }, { type: "priority" }],
      }
      break
    }
    case "after-hours-reply":
      input = {
        ...base,
        // Only fires outside the business hours set in Settings → General (never while they're off)
        description: "Replies to emails received outside your business hours (Settings → General).",
        conditions: { match: "all", conditions: [{ field: "business_hours", operator: "is_false" }] },
        actions: [{ type: "auto_reply", body: AFTER_HOURS_BODY }],
      }
      break
    case "newsletters-read": {
      const labelId = await ensureLabel(ctx, scope, "Newsletter", TEMPLATE_LABELS[templateId]!.color, createdLabels)
      input = {
        ...base,
        description: "Emails sent through mailing lists (List-Id header).",
        conditions: { match: "all", conditions: [{ field: "header", header: "List-Id", operator: "matches", value: ".+" }] },
        actions: [{ type: "mark_read" }, { type: "add_label", labelId }],
      }
      break
    }
  }
  const rule = await createRule(ctx, scope, input)
  return { ...rule, createdLabels }
}
