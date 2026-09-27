import "server-only"
import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"

export type AccessLevel = "read" | "reply" | "manage"
const rank: Record<AccessLevel, number> = { read: 1, reply: 2, manage: 3 }
const max = (a: AccessLevel | undefined, b: AccessLevel): AccessLevel => (!a || rank[b] > rank[a] ? b : a)

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">

/**
 * Inbox (email account) access for a user in a workspace.
 *  - Personal accounts: owner has "manage".
 *  - Shared accounts: via account_access rows for the user or their teams.
 *  - `conversations.view_all` grants "reply" (or "read") on all shared accounts.
 *  - `inboxes.manage` grants "manage" on all shared accounts.
 * Personal accounts of other users are only visible when explicitly shared.
 */
export async function getAccountAccess(ctx: Ctx): Promise<Map<string, AccessLevel>> {
  const orgId = ctx.org.id
  const userId = ctx.user.id
  const [accs, teamIds] = await Promise.all([
    db
      .select({ id: schema.accounts.id, ownerUserId: schema.accounts.ownerUserId })
      .from(schema.accounts)
      .where(eq(schema.accounts.orgId, orgId)),
    db
      .select({ teamId: schema.teamMembers.teamId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.orgId, orgId)))
      .then((r) => r.map((x) => x.teamId)),
  ])
  const result = new Map<string, AccessLevel>()
  if (accs.length === 0) return result
  const accIds = accs.map((a) => a.id)

  const grants = await db
    .select()
    .from(schema.accountAccess)
    .where(
      and(
        inArray(schema.accountAccess.accountId, accIds),
        or(
          eq(schema.accountAccess.userId, userId),
          teamIds.length ? inArray(schema.accountAccess.teamId, teamIds) : sql`false`
        )
      )
    )

  const canReply = ctx.permissions.has("conversations.reply")
  for (const a of accs) {
    if (a.ownerUserId === userId) {
      result.set(a.id, "manage")
      continue
    }
    if (a.ownerUserId === null) {
      if (ctx.permissions.has("inboxes.manage")) result.set(a.id, "manage")
      else if (ctx.permissions.has("conversations.view_all")) result.set(a.id, canReply ? "reply" : "read")
    }
  }
  for (const g of grants) {
    let level = g.level as AccessLevel
    if (level === "reply" && !canReply) level = "read"
    result.set(g.accountId, max(result.get(g.accountId), level))
  }
  return result
}

/**
 * SQL condition selecting the conversations visible to the user.
 *
 * Internal chats: only their *current* members (leaving a chat revokes access,
 * also for its creator).
 *
 * Email conversations:
 *  - in an inbox the user can access, or
 *  - assigned to the user, or
 *  - the user was explicitly @mentioned in a comment (sharing a conversation
 *    from an inbox the user can't otherwise see), or
 *  - created by the user without an inbox (internal thread).
 * Following alone does NOT grant access, so removing someone's inbox access
 * really removes it (except for conversations explicitly shared with them).
 */
export function visibleConversationsWhere(ctx: Ctx, accountIds: string[]): SQL {
  const c = schema.conversations
  const userId = ctx.user.id
  return and(
    eq(c.orgId, ctx.org.id),
    isNull(c.mergedIntoId),
    or(
      and(eq(c.kind, "chat"), sql`${userId}::uuid = any(${c.chatMemberIds})`),
      and(
        ne(c.kind, "chat"),
        or(
          accountIds.length ? inArray(c.accountId, accountIds) : sql`false`,
          sql`exists (select 1 from conversation_assignees ca where ca.conversation_id = ${c.id} and ca.user_id = ${userId})`,
          sql`exists (select 1 from comments cm where cm.conversation_id = ${c.id} and cm.deleted_at is null and ${userId}::uuid = any(cm.mentions))`,
          and(isNull(c.accountId), eq(c.createdBy, userId))
        )
      )
    )
  )!
}

/** Returns the access level for a single conversation, or null if not visible. */
export async function getConversationAccess(
  ctx: Ctx,
  conversationId: string,
  accountAccess?: Map<string, AccessLevel>
): Promise<{ conversation: typeof schema.conversations.$inferSelect; level: AccessLevel } | null> {
  const access = accountAccess ?? (await getAccountAccess(ctx))
  const ids = [...access.keys()]
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), visibleConversationsWhere(ctx, ids)))
    .limit(1)
  if (!conv) return null
  let level: AccessLevel = "reply"
  if (conv.accountId && access.has(conv.accountId)) level = access.get(conv.accountId)!
  else if (!ctx.permissions.has("conversations.reply")) level = "read"
  return { conversation: conv, level }
}
