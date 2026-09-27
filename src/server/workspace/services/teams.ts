import "server-only"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { fail } from "@/server/workspace/context"
import { filterMemberIds } from "@/server/workspace/queries/common"
import type { ServiceCtx } from "@/server/workspace/services/roles"

export const ASSIGNMENT_STRATEGIES = ["none", "round_robin", "least_busy", "random"] as const
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number]

export type TeamInput = {
  name: string
  description?: string | null
  color: string
  assignmentStrategy: AssignmentStrategy
}

/**
 * Teams that receive a shared inbox's conversations: the inbox's routing team
 * (`accounts.teamId`), the target of an enabled workspace `assign_team` rule,
 * or the team of a shared-inbox conversation (replies are auto-assigned within
 * `conversations.teamId`). Being assigned grants visibility, so whoever
 * controls such a team's members or strategy controls who reads that inbox.
 */
export async function routingTeamIds(orgId: string, teamIds: readonly string[]): Promise<Set<string>> {
  if (!teamIds.length) return new Set()
  const ids = [...teamIds]
  const rows = await db.execute<{ id: string }>(sql`
    select a.team_id::text as id from accounts a
    where a.org_id = ${orgId} and a.owner_user_id is null and a.team_id::text in ${ids}
    union
    select lower(act->>'teamId') as id from rules r, jsonb_array_elements(r.actions) act
    where r.org_id = ${orgId} and r.enabled and r.owner_user_id is null
      and act->>'type' = 'assign_team' and lower(act->>'teamId') in ${ids}
    union
    select t.id::text as id from teams t
    where t.org_id = ${orgId} and t.id::text in ${ids} and exists (
      select 1 from conversations c join accounts a on a.id = c.account_id
      where c.team_id = t.id and c.org_id = ${orgId} and a.owner_user_id is null)`)
  return new Set(rows.map((r) => r.id))
}

function canManageInboxRouting(ctx: ServiceCtx) {
  return ctx.role.key === "owner" || ctx.permissions.has("inboxes.manage")
}

/**
 * Putting someone into a team grants the team's inbox access. Only members who
 * manage teams may do that, and teams holding inbox grants or routing a shared
 * inbox additionally need `inboxes.manage` (owners are exempt) so team
 * membership can't be used to reach inboxes the actor couldn't share directly.
 */
export async function assertCanGrantTeamMembership(ctx: ServiceCtx, teamIds: readonly string[]) {
  if (!teamIds.length) return
  if (!ctx.permissions.has("teams.manage")) fail("Only members who can manage teams can add people to teams", 403)
  if (canManageInboxRouting(ctx)) return
  const [grant] = await db
    .select({ teamId: schema.accountAccess.teamId })
    .from(schema.accountAccess)
    .where(inArray(schema.accountAccess.teamId, [...teamIds]))
    .limit(1)
  if (grant) fail("These teams have inbox access — adding people to them requires the “Manage shared inboxes” permission", 403)
  await assertCanChangeTeamRouting(ctx, teamIds)
}

/**
 * Removing members or changing the assignment strategy of a routing team
 * decides who gets that inbox's conversations, so it needs `inboxes.manage`
 * (or owner) too.
 */
export async function assertCanChangeTeamRouting(ctx: ServiceCtx, teamIds: readonly string[]) {
  if (!teamIds.length || canManageInboxRouting(ctx)) return
  if ((await routingTeamIds(ctx.org.id, teamIds)).size) {
    fail("This team receives a shared inbox's conversations — changing it requires the “Manage shared inboxes” permission", 403)
  }
}

async function getOrgTeam(ctx: ServiceCtx, id: string) {
  const team = await db.query.teams.findFirst({
    where: and(eq(schema.teams.id, id), eq(schema.teams.orgId, ctx.org.id)),
  })
  if (!team) fail("Team not found", 404)
  return team
}

async function assertUniqueName(ctx: ServiceCtx, name: string, excludeId?: string) {
  const clash = await db.query.teams.findFirst({
    where: and(
      eq(schema.teams.orgId, ctx.org.id),
      sql`lower(${schema.teams.name}) = ${name.toLowerCase()}`,
      excludeId ? ne(schema.teams.id, excludeId) : undefined
    ),
    columns: { id: true },
  })
  if (clash) fail("A team with this name already exists")
}

export async function createTeam(ctx: ServiceCtx, input: TeamInput & { memberIds?: string[]; leadIds?: string[] }) {
  const name = input.name.trim()
  if (!name) fail("Name is required")
  await assertUniqueName(ctx, name)
  const memberIds = await filterMemberIds(ctx.org.id, input.memberIds ?? [])
  const leads = new Set(input.leadIds ?? [])
  return db.transaction(async (tx) => {
    const [team] = await tx
      .insert(schema.teams)
      .values({
        orgId: ctx.org.id,
        name,
        description: input.description?.trim() || null,
        color: input.color,
        assignmentStrategy: input.assignmentStrategy,
      })
      .returning()
    if (memberIds.length) {
      await tx
        .insert(schema.teamMembers)
        .values(memberIds.map((userId) => ({ teamId: team!.id, userId, isLead: leads.has(userId) })))
    }
    return { team: team!, memberIds }
  })
}

export async function updateTeam(ctx: ServiceCtx, input: TeamInput & { id: string }) {
  const team = await getOrgTeam(ctx, input.id)
  const name = input.name.trim()
  if (!name) fail("Name is required")
  if (name.toLowerCase() !== team.name.toLowerCase()) await assertUniqueName(ctx, name, team.id)
  if (input.assignmentStrategy !== team.assignmentStrategy) await assertCanChangeTeamRouting(ctx, [team.id])
  const [updated] = await db
    .update(schema.teams)
    .set({
      name,
      description: input.description?.trim() || null,
      color: input.color,
      assignmentStrategy: input.assignmentStrategy,
      // Restart the rotation when switching away from round robin
      lastAssignedUserId: input.assignmentStrategy === "round_robin" ? team.lastAssignedUserId : null,
    })
    .where(and(eq(schema.teams.id, team.id), eq(schema.teams.orgId, ctx.org.id)))
    .returning()
  const changes = Object.fromEntries(
    (["name", "description", "color", "assignmentStrategy"] as const)
      .filter((k) => (team[k] ?? null) !== (updated![k] ?? null))
      .map((k) => [k, { from: team[k], to: updated![k] }])
  )
  return { team: updated!, changes }
}

export async function deleteTeam(ctx: ServiceCtx, id: string) {
  const team = await getOrgTeam(ctx, id)
  // Deleting drops the team's inbox grants and routing: same bar as changing them
  if (!canManageInboxRouting(ctx)) {
    const [grant] = await db
      .select({ teamId: schema.accountAccess.teamId })
      .from(schema.accountAccess)
      .where(eq(schema.accountAccess.teamId, team.id))
      .limit(1)
    if (grant || (await routingTeamIds(ctx.org.id, [team.id])).size) {
      fail("This team has inbox access or receives a shared inbox's conversations — deleting it requires the “Manage shared inboxes” permission", 403)
    }
  }
  await db.delete(schema.teams).where(and(eq(schema.teams.id, team.id), eq(schema.teams.orgId, ctx.org.id)))
  return team
}

export async function addTeamMembers(ctx: ServiceCtx, input: { teamId: string; userIds: string[] }) {
  const team = await getOrgTeam(ctx, input.teamId)
  await assertCanGrantTeamMembership(ctx, [team.id])
  const valid = await filterMemberIds(ctx.org.id, input.userIds)
  if (!valid.length) fail("Choose at least one active member")
  const added = await db
    .insert(schema.teamMembers)
    .values(valid.map((userId) => ({ teamId: team.id, userId })))
    .onConflictDoNothing()
    .returning({ userId: schema.teamMembers.userId })
  return { team, added: added.map((a) => a.userId) }
}

export async function removeTeamMember(ctx: ServiceCtx, input: { teamId: string; userId: string }) {
  const team = await getOrgTeam(ctx, input.teamId)
  await assertCanChangeTeamRouting(ctx, [team.id])
  const removed = await db
    .delete(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, team.id), eq(schema.teamMembers.userId, input.userId)))
    .returning({ userId: schema.teamMembers.userId })
  if (!removed.length) fail("This person isn't in the team", 404)
  if (team.lastAssignedUserId === input.userId) {
    await db.update(schema.teams).set({ lastAssignedUserId: null }).where(eq(schema.teams.id, team.id))
  }
  return { team }
}

export async function setTeamLead(ctx: ServiceCtx, input: { teamId: string; userId: string; isLead: boolean }) {
  const team = await getOrgTeam(ctx, input.teamId)
  const updated = await db
    .update(schema.teamMembers)
    .set({ isLead: input.isLead })
    .where(and(eq(schema.teamMembers.teamId, team.id), eq(schema.teamMembers.userId, input.userId)))
    .returning({ userId: schema.teamMembers.userId })
  if (!updated.length) fail("This person isn't in the team", 404)
  return { team }
}
