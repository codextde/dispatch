import "server-only"
import { and, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm"
import { schema } from "@/server/db"
import { supportsStatusFilter, type ListFilters, type ParsedBox } from "@/lib/inbox/boxes"
import type { Ctx, InboxScope } from "./scope"

/**
 * SQL building blocks for mailboxes. See src/lib/inbox/boxes.ts for the
 * documented semantics. All fragments reference the `conversations` table.
 */
const c = schema.conversations

/**
 * Fully qualified column references for correlated subqueries. Drizzle
 * renders columns unqualified inside select lists, where e.g. `"id"` would
 * bind to the subquery's own table.
 */
export const CONV_ID = sql.raw(`"conversations"."id"`)
const CONV_LAST_ACTIVITY = sql.raw(`"conversations"."last_activity_at"`)

export function unreadSql(userId: string): SQL {
  return sql`not exists (select 1 from conversation_user_state s where s.conversation_id = ${CONV_ID} and s.user_id = ${userId} and s.last_read_at is not null and s.last_read_at >= ${CONV_LAST_ACTIVITY})`
}

export function userFlagSql(userId: string, flag: "starred" | "pinned" | "following" | "muted"): SQL {
  return sql`exists (select 1 from conversation_user_state s where s.conversation_id = ${CONV_ID} and s.user_id = ${userId} and s.${sql.raw(flag)} = true)`
}

export function assignedToSql(userId: string): SQL {
  return sql`exists (select 1 from conversation_assignees ca where ca.conversation_id = ${CONV_ID} and ca.user_id = ${userId})`
}

export const unassignedSql: SQL = sql`not exists (select 1 from conversation_assignees ca where ca.conversation_id = ${CONV_ID})`

export function assignedToOthersSql(userId: string): SQL {
  return sql`exists (select 1 from conversation_assignees ca where ca.conversation_id = ${CONV_ID} and ca.user_id <> ${userId})`
}

export function mentionedSql(userId: string): SQL {
  return sql`exists (select 1 from comments cm where cm.conversation_id = ${CONV_ID} and ${userId}::uuid = any(cm.mentions) and cm.deleted_at is null)`
}

export function myMessageSql(userId: string, statuses: string[], direction?: "outbound"): SQL {
  const list = sql.join(
    statuses.map((s) => sql`${s}`),
    sql`, `
  )
  return sql`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.author_id = ${userId} and m.status::text in (${list})${direction ? sql` and m.direction = ${direction}` : sql``})`
}

export function teamSql(orgId: string, teamId: string): SQL {
  return or(
    eq(c.teamId, teamId),
    sql`${c.accountId} in (select a.id from accounts a where a.org_id = ${orgId} and a.team_id = ${teamId})`
  )!
}

export function labelSql(labelId: string): SQL {
  return sql`exists (select 1 from conversation_labels cl where cl.conversation_id = ${CONV_ID} and cl.label_id = ${labelId})`
}

export const activeSql: SQL = and(eq(c.isSpam, false), eq(c.isTrash, false))!
export const awakeSql: SQL = or(isNull(c.snoozedUntil), lte(c.snoozedUntil, sql`now()`))!
export const snoozedSql: SQL = gt(c.snoozedUntil, sql`now()`)
export const emailSql: SQL = eq(c.kind, "email")
export const hasMessagesSql: SQL = gt(c.messageCount, 0)
export const openSql: SQL = eq(c.status, "open")

/** Base condition of a box (without visibility and list filters). */
export function boxBaseSql(ctx: Ctx, scope: InboxScope, box: ParsedBox): SQL {
  const me = ctx.user.id
  const workable = and(emailSql, activeSql, awakeSql, hasMessagesSql)!
  switch (box.kind) {
    case "team":
      return and(workable, teamSql(ctx.org.id, box.id))!
    case "account":
      return and(workable, eq(c.accountId, box.id))!
    case "label":
      return and(activeSql, hasMessagesSql, labelSql(box.id))!
    case "static":
      switch (box.id) {
        case "inbox":
          return and(
            workable,
            or(
              scope.personalAccountIds.length ? inArray(c.accountId, scope.personalAccountIds) : sql`false`,
              assignedToSql(me),
              and(userFlagSql(me, "following"), unreadSql(me))
            )
          )!
        case "assigned":
          return and(workable, assignedToSql(me))!
        case "unassigned":
          return and(workable, unassignedSql)!
        case "mentions":
          return and(activeSql, mentionedSql(me))!
        case "starred":
          return and(eq(c.isTrash, false), hasMessagesSql, userFlagSql(me, "starred"))!
        case "snoozed":
          return and(emailSql, activeSql, snoozedSql)!
        case "drafts":
          return and(eq(c.isTrash, false), myMessageSql(me, ["draft"]))!
        case "scheduled":
          return and(eq(c.isTrash, false), myMessageSql(me, ["scheduled"]))!
        case "sent":
          return and(eq(c.isTrash, false), myMessageSql(me, ["queued", "sending", "sent", "failed"], "outbound"))!
        case "all":
          return and(emailSql, activeSql, hasMessagesSql)!
        case "closed":
          return and(emailSql, activeSql, hasMessagesSql, eq(c.status, "closed"))!
        case "spam":
          return and(emailSql, eq(c.isSpam, true), eq(c.isTrash, false))!
        case "trash":
          return and(emailSql, eq(c.isTrash, true))!
        case "chats":
          return and(eq(c.kind, "chat"), sql`${me}::uuid = any(${c.chatMemberIds})`)!
        case "search":
          return sql`true`
      }
  }
}

/** Filters from the list header (status, unread only, assignee). */
export function listFilterSql(ctx: Ctx, box: ParsedBox, filters: ListFilters): SQL | undefined {
  const me = ctx.user.id
  const parts: SQL[] = []
  if (supportsStatusFilter(box) && filters.status && filters.status !== "all") parts.push(eq(c.status, filters.status))
  if (filters.unread) parts.push(unreadSql(me))
  switch (filters.assignee) {
    case "me":
      parts.push(assignedToSql(me))
      break
    case "none":
      parts.push(unassignedSql)
      break
    case "others":
      parts.push(assignedToOthersSql(me))
      break
  }
  return parts.length ? and(...parts) : undefined
}
