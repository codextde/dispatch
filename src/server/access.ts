import "server-only"
import { and, eq, gt, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"

export type AccessLevel = "read" | "reply" | "manage"
const rank: Record<AccessLevel, number> = { read: 1, reply: 2, manage: 3 }
const max = (a: AccessLevel | undefined, b: AccessLevel): AccessLevel => (!a || rank[b] > rank[a] ? b : a)

/** Who is looking: only ids and permissions matter (so recipients can be checked without a session). */
type Ctx = { org: Pick<OrgContext["org"], "id">; user: Pick<OrgContext["user"], "id">; permissions: Set<string> }

/**
 * Inbox (email account) access for a user in a workspace.
 *  - Personal accounts: owner has "manage".
 *  - Shared accounts: via account_access rows for the user or their teams.
 *  - `conversations.view_all` grants "reply" on all shared accounts.
 *  - `inboxes.manage` grants "manage" on all shared accounts.
 * Without `conversations.reply` (roles or restricted API keys) every level,
 * including personal ownership and "manage", is capped at "read".
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
  const cap = (level: AccessLevel): AccessLevel => (canReply ? level : "read")
  for (const a of accs) {
    if (a.ownerUserId === userId) {
      result.set(a.id, cap("manage"))
      continue
    }
    if (a.ownerUserId === null) {
      if (ctx.permissions.has("inboxes.manage")) result.set(a.id, cap("manage"))
      else if (ctx.permissions.has("conversations.view_all")) result.set(a.id, cap("reply"))
    }
  }
  for (const g of grants) {
    result.set(g.accountId, max(result.get(g.accountId), cap(g.level as AccessLevel)))
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
 * A new-message conversation stays private to its creator until something
 * is sent (its subject and recipients come from an unsent draft).
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
        or(gt(c.messageCount, 0), eq(c.createdBy, userId)),
        or(
          accountIds.length ? inArray(c.accountId, accountIds) : sql`false`,
          // Assigned by someone else (or a rule/auto-assignment). Self-assignments don't outlive revoked inbox access.
          sql`exists (select 1 from conversation_assignees ca where ca.conversation_id = ${c.id} and ca.user_id = ${userId} and ca.assigned_by is distinct from ${userId}::uuid)`,
          // Explicit share by *someone else* (self-mentions must not preserve revoked access)
          sql`exists (select 1 from comments cm where cm.conversation_id = ${c.id} and cm.deleted_at is null and ${userId}::uuid = any(cm.mentions) and cm.author_id is distinct from ${userId}::uuid)`,
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

/** The ids among `conversationIds` that the user can see. */
export async function visibleConversationIds(ctx: Ctx, conversationIds: string[], accountIds?: string[]): Promise<Set<string>> {
  const ids = [...new Set(conversationIds)]
  if (!ids.length) return new Set()
  const accounts = accountIds ?? [...(await getAccountAccess(ctx)).keys()]
  const rows = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(inArray(schema.conversations.id, ids), visibleConversationsWhere(ctx, accounts)))
  return new Set(rows.map((r) => r.id))
}

/**
 * The active members among `userIds` who can currently see the conversation,
 * each evaluated with their own role and inbox access. Use it before sending
 * notifications, so people who lost access stop receiving its content.
 */
export async function filterVisibleRecipients(orgId: string, conversationId: string, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds)]
  if (!ids.length) return []
  const members = await db
    .select({ userId: schema.memberships.userId, permissions: schema.roles.permissions })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.status, "active"), inArray(schema.memberships.userId, ids)))
  const visible = await Promise.all(
    members.map(async (m) => {
      const viewer: Ctx = { org: { id: orgId }, user: { id: m.userId }, permissions: new Set(m.permissions) }
      return (await visibleConversationIds(viewer, [conversationId])).has(conversationId) ? m.userId : null
    })
  )
  return visible.filter((u): u is string => u !== null)
}

/**
 * Whether a conversation belongs to a shared inbox. Everything else (personal
 * inboxes, conversations without an inbox, chats, unknown ids) is private:
 * it never reaches workspace webhooks or workspace-wide events.
 */
export async function conversationPrivacy(orgId: string, conversationId: string): Promise<{ shared: boolean; ownerUserId: string | null }> {
  const [row] = await db
    .select({ kind: schema.conversations.kind, accountId: schema.accounts.id, ownerUserId: schema.accounts.ownerUserId })
    .from(schema.conversations)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.conversations.accountId))
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.orgId, orgId)))
    .limit(1)
  return { shared: Boolean(row && row.kind === "email" && row.accountId && !row.ownerUserId), ownerUserId: row?.ownerUserId ?? null }
}
