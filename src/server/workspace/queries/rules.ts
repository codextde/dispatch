import "server-only"
import { and, asc, eq, isNull, or } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { listMemberOptions, listTeamOptions } from "@/server/workspace/queries/common"
import { usableSharedResponsesWhere, userTeamIds } from "@/server/workspace/response-access"
import type { RuleScope } from "@/components/settings/rules/definitions"
import type { RuleLookup } from "@/components/settings/rules/summary"

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">

export type RuleListItem = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger: string
  conditions: typeof schema.rules.$inferSelect.conditions
  actions: typeof schema.rules.$inferSelect.actions
  accountIds: string[]
  stopProcessing: boolean
  runCount: number
  lastRunAt: Date | null
  updatedAt: Date
}

function scopeWhere(ctx: Ctx, scope: RuleScope) {
  return and(
    eq(schema.rules.orgId, ctx.org.id),
    scope === "workspace" ? isNull(schema.rules.ownerUserId) : eq(schema.rules.ownerUserId, ctx.user.id)
  )
}

export async function listRules(ctx: Ctx, scope: RuleScope): Promise<RuleListItem[]> {
  const r = schema.rules
  return db
    .select({
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      trigger: r.trigger,
      conditions: r.conditions,
      actions: r.actions,
      accountIds: r.accountIds,
      stopProcessing: r.stopProcessing,
      runCount: r.runCount,
      lastRunAt: r.lastRunAt,
      updatedAt: r.updatedAt,
    })
    .from(r)
    .where(scopeWhere(ctx, scope))
    .orderBy(asc(r.position), asc(r.createdAt))
}

export type RuleOptions = {
  accounts: { id: string; name: string; email: string; color: string; provider: string }[]
  labels: { id: string; name: string; color: string; visibility: "shared" | "private" }[]
  members: { id: string; name: string | null; email: string; avatarUrl: string | null }[]
  teams: { id: string; name: string; color: string }[]
  responses: { id: string; name: string; kind: "workspace" | "team" | "personal" }[]
}

/** Label names with their parent path ("Customers / VIP"). */
function labelPaths(rows: { id: string; name: string; parentId: string | null }[]) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const path = (id: string, depth = 0): string => {
    const l = byId.get(id)
    if (!l) return ""
    if (!l.parentId || depth > 5 || !byId.has(l.parentId)) return l.name
    return `${path(l.parentId, depth + 1)} / ${l.name}`
  }
  return new Map(rows.map((r) => [r.id, path(r.id)]))
}

/** Pickers for the rule builder, restricted to what `scope` may reference. */
export async function loadRuleOptions(ctx: Ctx, scope: RuleScope): Promise<RuleOptions> {
  const a = schema.accounts
  const l = schema.labels
  const c = schema.cannedResponses
  const [accounts, labels, members, teams, responses] = await Promise.all([
    db
      .select({ id: a.id, name: a.name, email: a.email, color: a.color, provider: a.provider })
      .from(a)
      .where(and(eq(a.orgId, ctx.org.id), scope === "workspace" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)))
      .orderBy(asc(a.name)),
    db
      .select({ id: l.id, name: l.name, color: l.color, parentId: l.parentId, visibility: l.visibility })
      .from(l)
      .where(
        and(
          eq(l.orgId, ctx.org.id),
          scope === "workspace" ? eq(l.visibility, "shared") : or(eq(l.visibility, "shared"), eq(l.ownerUserId, ctx.user.id))
        )
      )
      .orderBy(asc(l.position), asc(l.name)),
    listMemberOptions(ctx.org.id),
    listTeamOptions(ctx.org.id),
    userTeamIds(ctx.org.id, ctx.user.id).then((teamIds) => {
      // Team responses only for the actor's teams (or response managers), as enforced when saving
      const shared = usableSharedResponsesWhere({ canManage: ctx.permissions.has("responses.manage"), teamIds })
      return db
        .select({ id: c.id, name: c.name, teamId: c.teamId, ownerUserId: c.ownerUserId })
        .from(c)
        .where(and(eq(c.orgId, ctx.org.id), scope === "workspace" ? shared : or(shared, eq(c.ownerUserId, ctx.user.id))))
        .orderBy(asc(c.name))
    }),
  ])
  const paths = labelPaths(labels)
  return {
    accounts,
    labels: labels.map((x) => ({ id: x.id, name: paths.get(x.id) ?? x.name, color: x.color, visibility: x.visibility })),
    members: members.map((m) => ({ id: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })),
    teams,
    responses: responses.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.ownerUserId ? ("personal" as const) : r.teamId ? ("team" as const) : ("workspace" as const),
    })),
  }
}

/** Names of everything a rule of this member may reference (for summaries). */
export async function loadRuleLookup(ctx: Ctx): Promise<RuleLookup> {
  const a = schema.accounts
  const l = schema.labels
  const c = schema.cannedResponses
  const [accounts, labels, members, teams, responses] = await Promise.all([
    db
      .select({ id: a.id, name: a.name })
      .from(a)
      .where(and(eq(a.orgId, ctx.org.id), or(isNull(a.ownerUserId), eq(a.ownerUserId, ctx.user.id)))),
    db
      .select({ id: l.id, name: l.name, parentId: l.parentId })
      .from(l)
      .where(and(eq(l.orgId, ctx.org.id), or(eq(l.visibility, "shared"), eq(l.ownerUserId, ctx.user.id)))),
    listMemberOptions(ctx.org.id, { includeSuspended: true }),
    listTeamOptions(ctx.org.id),
    userTeamIds(ctx.org.id, ctx.user.id).then((teamIds) =>
      db
        .select({ id: c.id, name: c.name })
        .from(c)
        .where(
          and(
            eq(c.orgId, ctx.org.id),
            or(usableSharedResponsesWhere({ canManage: ctx.permissions.has("responses.manage"), teamIds }), eq(c.ownerUserId, ctx.user.id))
          )
        )
    ),
  ])
  const paths = labelPaths(labels)
  return {
    accounts: Object.fromEntries(accounts.map((x) => [x.id, x.name])),
    labels: Object.fromEntries(labels.map((x) => [x.id, paths.get(x.id) ?? x.name])),
    users: Object.fromEntries(members.map((m) => [m.userId, m.name || m.email])),
    teams: Object.fromEntries(teams.map((t) => [t.id, t.name])),
    responses: Object.fromEntries(responses.map((r) => [r.id, r.name])),
  }
}
