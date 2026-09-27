import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { getAccountAccess, visibleConversationsWhere, type AccessLevel } from "@/server/access"

export type Ctx = Pick<OrgContext, "org" | "user" | "permissions">

/**
 * Everything needed to evaluate conversation visibility for one request:
 * accessible accounts (with level), the user's personal accounts and teams.
 */
export type InboxScope = {
  access: Map<string, AccessLevel>
  accountIds: string[]
  personalAccountIds: string[]
  teamIds: string[]
}

export async function loadScope(ctx: Ctx): Promise<InboxScope> {
  const [access, personal, teams] = await Promise.all([
    getAccountAccess(ctx),
    db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.orgId, ctx.org.id), eq(schema.accounts.ownerUserId, ctx.user.id))),
    db
      .select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(and(eq(schema.teamMembers.userId, ctx.user.id), eq(schema.teams.orgId, ctx.org.id))),
  ])
  return {
    access,
    accountIds: [...access.keys()],
    personalAccountIds: personal.map((p) => p.id),
    teamIds: teams.map((t) => t.teamId),
  }
}

export function visibleWhere(ctx: Ctx, scope: InboxScope) {
  return visibleConversationsWhere(ctx, scope.accountIds)
}

const rank: Record<AccessLevel, number> = { read: 1, reply: 2, manage: 3 }
export function atLeast(level: AccessLevel, min: AccessLevel) {
  return rank[level] >= rank[min]
}

/** Access level of a (visible) conversation row, mirroring getConversationAccess(). */
export function levelFor(ctx: Ctx, scope: InboxScope, conv: { accountId: string | null; kind: string }): AccessLevel {
  if (conv.accountId && scope.access.has(conv.accountId)) return scope.access.get(conv.accountId)!
  if (!ctx.permissions.has("conversations.reply")) return conv.kind === "chat" ? "reply" : "read"
  return "reply"
}

export type AccessibleConversation = { conversation: typeof schema.conversations.$inferSelect; level: AccessLevel }

/** Load the visible conversations among `ids` (unknown / invisible ids are dropped). */
export async function loadAccessible(ctx: Ctx, scope: InboxScope, ids: string[]): Promise<AccessibleConversation[]> {
  if (!ids.length) return []
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(and(inArray(schema.conversations.id, ids), visibleWhere(ctx, scope)))
  return rows.map((conversation) => ({ conversation, level: levelFor(ctx, scope, conversation) }))
}

export async function loadOneAccessible(ctx: Ctx, scope: InboxScope, id: string) {
  const [row] = await loadAccessible(ctx, scope, [id])
  return row ?? null
}
