import "server-only"
import { asc, eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { listMemberOptions } from "@/server/workspace/queries/common"

export type TeamMemberRow = {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  isLead: boolean
  status: "active" | "suspended"
}

export type TeamRow = {
  id: string
  name: string
  description: string | null
  color: string
  assignmentStrategy: "none" | "round_robin" | "least_busy" | "random"
  createdAt: Date
  members: TeamMemberRow[]
  inboxCount: number
  openConversations: number
}

const STRATEGIES = new Set(["none", "round_robin", "least_busy", "random"])

export async function loadTeamsPage(ctx: OrgContext) {
  const orgId = ctx.org.id
  const [teams, members, inboxCounts, openCounts, memberOptions] = await Promise.all([
    db.select().from(schema.teams).where(eq(schema.teams.orgId, orgId)).orderBy(asc(schema.teams.name)),
    db
      .select({
        teamId: schema.teamMembers.teamId,
        isLead: schema.teamMembers.isLead,
        userId: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        status: schema.memberships.status,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
      // Only people who are (still) members of this workspace
      .innerJoin(
        schema.memberships,
        sql`${schema.memberships.userId} = ${schema.teamMembers.userId} and ${schema.memberships.orgId} = ${orgId}`
      )
      .where(eq(schema.teams.orgId, orgId))
      .orderBy(sql`${schema.teamMembers.isLead} desc`, sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`),
    db
      .select({ teamId: schema.accounts.teamId, n: sql<number>`count(*)::int` })
      .from(schema.accounts)
      .where(eq(schema.accounts.orgId, orgId))
      .groupBy(schema.accounts.teamId),
    db
      .select({ teamId: schema.conversations.teamId, n: sql<number>`count(*)::int` })
      .from(schema.conversations)
      .where(
        sql`${schema.conversations.orgId} = ${orgId} and ${schema.conversations.status} = 'open' and ${schema.conversations.teamId} is not null and not ${schema.conversations.isSpam} and not ${schema.conversations.isTrash} and ${schema.conversations.mergedIntoId} is null`
      )
      .groupBy(schema.conversations.teamId),
    listMemberOptions(orgId),
  ])

  const byTeam = new Map<string, TeamMemberRow[]>()
  for (const m of members) {
    if (!byTeam.has(m.teamId)) byTeam.set(m.teamId, [])
    byTeam.get(m.teamId)!.push({
      userId: m.userId,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      isLead: m.isLead,
      status: m.status,
    })
  }
  const inboxes = new Map(inboxCounts.map((r) => [r.teamId, r.n]))
  const open = new Map(openCounts.map((r) => [r.teamId, r.n]))

  const rows: TeamRow[] = teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    color: t.color,
    assignmentStrategy: (STRATEGIES.has(t.assignmentStrategy) ? t.assignmentStrategy : "none") as TeamRow["assignmentStrategy"],
    createdAt: t.createdAt,
    members: byTeam.get(t.id) ?? [],
    inboxCount: inboxes.get(t.id) ?? 0,
    openConversations: open.get(t.id) ?? 0,
  }))

  return { teams: rows, memberOptions }
}

export type TeamsPageData = Awaited<ReturnType<typeof loadTeamsPage>>
