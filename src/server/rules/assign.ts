import "server-only"
import crypto from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { notify } from "@/server/notifications"
import { emitWebhook } from "@/server/jobs"

/**
 * Automatic assignment of conversations to team members (team workload
 * balancing and the rules engine). Members who are away (`awayUntil` in the
 * future), suspended or disabled are skipped.
 */

export type AssignStrategy = "round_robin" | "least_busy" | "random"

export function isAssignStrategy(value: string | null | undefined): value is AssignStrategy {
  return value === "round_robin" || value === "least_busy" || value === "random"
}

/**
 * Pick the next team member according to `strategy` and remember the choice
 * (teams.lastAssignedUserId). The team row is locked so concurrent picks
 * rotate correctly.
 */
export async function pickTeamMember(orgId: string, teamId: string, strategy: AssignStrategy): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: schema.teams.id, lastAssignedUserId: schema.teams.lastAssignedUserId })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)))
      .for("update")
    if (!team) return null

    const candidates = await tx.execute<{ user_id: string }>(sql`
      select tm.user_id
      from team_members tm
      join memberships m on m.user_id = tm.user_id and m.org_id = ${orgId} and m.status = 'active'
      join users u on u.id = tm.user_id and u.status = 'active'
      where tm.team_id = ${teamId} and (u.away_until is null or u.away_until <= now())
      order by tm.created_at, tm.user_id
    `)
    const ids = candidates.map((r) => r.user_id)
    if (!ids.length) return null

    // Rotation order starting right after the last assignee
    const lastIdx = team.lastAssignedUserId ? ids.indexOf(team.lastAssignedUserId) : -1
    const rotation = [...ids.slice(lastIdx + 1), ...ids.slice(0, lastIdx + 1)]

    let chosen: string
    if (strategy === "random") {
      chosen = ids[crypto.randomInt(ids.length)]!
    } else if (strategy === "least_busy") {
      const loads = await tx.execute<{ user_id: string; n: number }>(sql`
        select ca.user_id, count(*)::int as n
        from conversation_assignees ca
        join conversations c on c.id = ca.conversation_id
        where c.org_id = ${orgId} and c.status = 'open' and c.is_spam = false and c.is_trash = false
          and ca.user_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
        group by ca.user_id
      `)
      const load = new Map(loads.map((r) => [r.user_id, Number(r.n)]))
      chosen = rotation.reduce((best, id) => ((load.get(id) ?? 0) < (load.get(best) ?? 0) ? id : best), rotation[0]!)
    } else {
      chosen = rotation[0]!
    }

    await tx.update(schema.teams).set({ lastAssignedUserId: chosen }).where(eq(schema.teams.id, teamId))
    return chosen
  })
}

/** Is `userId` an active member of the organization? */
export async function isActiveMember(orgId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.status, "active"),
        eq(schema.users.status, "active")
      )
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Add `userId` as assignee (no-op if already assigned): timeline event,
 * follow, notification and `conversation.assigned` webhook. Actor is the
 * system (null).
 */
export async function assignConversation(opts: {
  orgId: string
  conversationId: string
  userId: string
  reason: "auto" | "rule"
  ruleId?: string
}): Promise<boolean> {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, opts.conversationId), eq(schema.conversations.orgId, opts.orgId)),
    columns: { id: true, number: true, subject: true, customSubject: true, accountId: true },
  })
  if (!conv) return false
  const added = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(schema.conversationAssignees)
      .values({ conversationId: conv.id, userId: opts.userId, assignedBy: null })
      .onConflictDoNothing()
      .returning({ userId: schema.conversationAssignees.userId })
    if (!rows.length) return false
    await tx
      .insert(schema.conversationUserState)
      .values({ conversationId: conv.id, userId: opts.userId, following: true, unread: true })
      .onConflictDoUpdate({
        target: [schema.conversationUserState.conversationId, schema.conversationUserState.userId],
        set: { following: true },
      })
    await tx.insert(schema.conversationEvents).values({
      orgId: opts.orgId,
      conversationId: conv.id,
      actorId: null,
      type: "assigned",
      data: { userIds: [opts.userId], auto: true, reason: opts.reason, ...(opts.ruleId ? { ruleId: opts.ruleId } : {}) },
    })
    return true
  })
  if (!added) return false
  const subject = conv.customSubject || conv.subject || "(no subject)"
  await notify({
    orgId: opts.orgId,
    userIds: [opts.userId],
    type: "assigned",
    title: `You were assigned “${subject}”`,
    body: opts.reason === "rule" ? "Assigned automatically by a rule" : "Assigned automatically",
    conversationId: conv.id,
  })
  // Workspace webhooks never carry conversations of personal inboxes
  const account = conv.accountId
    ? await db.query.accounts.findFirst({ where: eq(schema.accounts.id, conv.accountId), columns: { ownerUserId: true } })
    : null
  if (account?.ownerUserId) return true
  await emitWebhook(opts.orgId, "conversation.assigned", {
    conversationId: conv.id,
    number: conv.number,
    userIds: [opts.userId],
    assignedBy: null,
  })
  return true
}

/** Balanced pick within the team and assignment. Returns the assignee or null. */
export async function autoAssignToTeam(opts: {
  orgId: string
  conversationId: string
  teamId: string
  strategy: AssignStrategy
  reason: "auto" | "rule"
  ruleId?: string
}): Promise<string | null> {
  const userId = await pickTeamMember(opts.orgId, opts.teamId, opts.strategy)
  if (!userId) return null
  await assignConversation({ ...opts, userId })
  return userId
}
