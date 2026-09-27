import "server-only"
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { listTeamOptions, type TeamOption } from "@/server/workspace/queries/common"
import { scopeOf, type ResponseScope } from "@/server/workspace/services/responses"

export type ResponseListItem = {
  id: string
  name: string
  subject: string | null
  shortcut: string | null
  body: string
  scope: ResponseScope
  teamId: string | null
  usageCount: number
  updatedAt: Date
  editable: boolean
}

/**
 * Responses visible to the member: their personal ones, workspace ones, and
 * team ones (all teams for managers, otherwise only teams they belong to).
 */
export async function loadResponsesPage(ctx: Pick<OrgContext, "org" | "user" | "permissions">): Promise<{
  responses: ResponseListItem[]
  teams: TeamOption[]
}> {
  const r = schema.cannedResponses
  const canManage = ctx.permissions.has("responses.manage")
  const [teams, myTeamIds] = await Promise.all([
    listTeamOptions(ctx.org.id),
    db
      .select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(and(eq(schema.teamMembers.userId, ctx.user.id), eq(schema.teams.orgId, ctx.org.id)))
      .then((rows) => rows.map((x) => x.teamId)),
  ])

  const sharedVisible = canManage
    ? isNull(r.ownerUserId)
    : and(isNull(r.ownerUserId), or(isNull(r.teamId), myTeamIds.length ? inArray(r.teamId, myTeamIds) : sql`false`))

  const rows = await db
    .select({
      id: r.id,
      name: r.name,
      subject: r.subject,
      shortcut: r.shortcut,
      body: r.body,
      ownerUserId: r.ownerUserId,
      teamId: r.teamId,
      usageCount: r.usageCount,
      updatedAt: r.updatedAt,
    })
    .from(r)
    .where(and(eq(r.orgId, ctx.org.id), or(eq(r.ownerUserId, ctx.user.id), sharedVisible)))
    .orderBy(desc(r.usageCount), sql`lower(${r.name})`)

  return {
    responses: rows.map(({ ownerUserId, ...row }) => {
      const scope = scopeOf({ ownerUserId, teamId: row.teamId })
      return { ...row, scope, editable: scope === "personal" || canManage }
    }),
    teams: canManage ? teams : teams.filter((t) => myTeamIds.includes(t.id)),
  }
}
