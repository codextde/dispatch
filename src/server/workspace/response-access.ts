import "server-only"
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"

/**
 * Who may use a canned response (in the composer or in a rule's auto-reply):
 * its owner (personal responses), everyone (workspace responses), or members of
 * its team plus response managers (team responses).
 */

/** Team ids the user belongs to in this workspace. */
export async function userTeamIds(orgId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.orgId, orgId)))
  return rows.map((r) => r.teamId)
}

/**
 * SQL filter on `canned_responses` for shared responses the user may use
 * (`canManage` = the user has `responses.manage` and sees every team's).
 */
export function usableSharedResponsesWhere(opts: { canManage: boolean; teamIds: string[] }): SQL {
  const c = schema.cannedResponses
  if (opts.canManage) return isNull(c.ownerUserId)
  return and(isNull(c.ownerUserId), or(isNull(c.teamId), opts.teamIds.length ? inArray(c.teamId, opts.teamIds) : sql`false`))!
}

/**
 * Run-time check for a stored rule: may `userId` (the owner of a personal
 * rule) use this response? Re-checked on every run because team membership
 * and roles change after the rule was saved.
 */
export async function canUseCannedResponse(
  orgId: string,
  userId: string,
  response: { ownerUserId: string | null; teamId: string | null }
): Promise<boolean> {
  if (response.ownerUserId) return response.ownerUserId === userId
  if (!response.teamId) return true
  const rows = await db.execute<{ ok: number }>(sql`
    select 1 as ok from team_members tm join teams t on t.id = tm.team_id
    where tm.team_id = ${response.teamId} and tm.user_id = ${userId} and t.org_id = ${orgId}
    union all
    select 1 from memberships m join roles r on r.id = m.role_id
    where m.org_id = ${orgId} and m.user_id = ${userId} and m.status = 'active'
      and (r.key = 'owner' or 'responses.manage' = any(r.permissions))
    limit 1`)
  return rows.length > 0
}
