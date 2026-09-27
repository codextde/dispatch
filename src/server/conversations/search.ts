import "server-only"
import { and, eq, gte, lte, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { ParsedSearch } from "@/lib/inbox/search-query"
import { CONV_ID, activeSql, assignedToSql, snoozedSql, unassignedSql, unreadSql, userFlagSql } from "./boxes"
import type { Ctx } from "./scope"

const c = schema.conversations

/**
 * Prefix full-text query ("inv 42" → 'inv:* & 42:*') for the 'simple'
 * configuration. Returns null when nothing searchable remains.
 */
export function toPrefixTsQuery(text: string): string | null {
  const terms = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}@._-]+/u)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, " ").trim())
    .flatMap((t) => t.split(/\s+/))
    .filter((t) => t.length > 0)
    .slice(0, 8)
  if (!terms.length) return null
  return terms.map((t) => `${t}:*`).join(" & ")
}

const like = (value: string) => `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`

/**
 * SQL condition for a parsed search. Full-text matches the conversation
 * (subject + snippet, GIN index `conversations_search_idx`) or any message
 * (subject + text body, GIN index `messages_search_idx`) or a comment.
 */
export async function searchSql(ctx: Ctx, q: ParsedSearch): Promise<SQL> {
  const me = ctx.user.id
  const parts: SQL[] = []

  if (q.text) {
    const tsq = toPrefixTsQuery(q.text)
    if (tsq) {
      parts.push(
        or(
          sql`to_tsvector('simple', coalesce(${c.subject}, '') || ' ' || coalesce(${c.snippet}, '')) @@ to_tsquery('simple', ${tsq})`,
          sql`${c.customSubject} ilike ${like(q.text)}`,
          sql`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.status <> 'draft' and to_tsvector('simple', coalesce(m.subject, '') || ' ' || coalesce(m.text_body, '')) @@ to_tsquery('simple', ${tsq}))`,
          sql`exists (select 1 from comments cm where cm.conversation_id = ${CONV_ID} and cm.deleted_at is null and cm.body ilike ${like(q.text)})`,
          sql`${c.number}::text = ${q.text.replace(/^#/, "")}`
        )!
      )
    }
  }

  for (const from of q.from) {
    const v = like(from)
    parts.push(
      sql`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.status <> 'draft' and (m.from_email ilike ${v} or m.from_name ilike ${v}))`
    )
  }
  for (const to of q.to) {
    const v = like(to)
    parts.push(
      sql`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.status <> 'draft' and (m.to::text ilike ${v} or m.cc::text ilike ${v}))`
    )
  }
  for (const s of q.subject) parts.push(sql`coalesce(${c.customSubject}, ${c.subject}) ilike ${like(s)}`)

  if (q.hasAttachment) parts.push(eq(c.hasAttachments, true))

  for (const flag of q.is) {
    switch (flag) {
      case "unread":
        parts.push(unreadSql(me))
        break
      case "read":
        parts.push(sql`not ${unreadSql(me)}`)
        break
      case "open":
        parts.push(eq(c.status, "open"))
        break
      case "closed":
      case "done":
        parts.push(eq(c.status, "closed"))
        break
      case "starred":
        parts.push(userFlagSql(me, "starred"))
        break
      case "snoozed":
        parts.push(snoozedSql)
        break
      case "assigned":
        parts.push(sql`not ${unassignedSql}`)
        break
      case "unassigned":
        parts.push(unassignedSql)
        break
      case "priority":
        parts.push(eq(c.priority, true))
        break
    }
  }

  // Spam and trash are excluded unless explicitly requested with in:spam / in:trash
  if (q.in.has("trash")) parts.push(eq(c.isTrash, true))
  else if (q.in.has("spam")) parts.push(and(eq(c.isSpam, true), eq(c.isTrash, false))!)
  else if (!q.in.has("anywhere")) parts.push(activeSql)
  if (q.in.has("chats")) parts.push(eq(c.kind, "chat"))

  if (q.label.length) {
    const labelRows = await db
      .select({ id: schema.labels.id, name: schema.labels.name })
      .from(schema.labels)
      .where(
        and(
          eq(schema.labels.orgId, ctx.org.id),
          or(eq(schema.labels.visibility, "shared"), eq(schema.labels.ownerUserId, me))
        )
      )
    for (const name of q.label) {
      const ids = labelRows.filter((l) => l.name.toLowerCase() === name.toLowerCase() || l.id === name).map((l) => l.id)
      parts.push(
        ids.length
          ? sql`exists (select 1 from conversation_labels cl where cl.conversation_id = ${CONV_ID} and cl.label_id in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `
            )}))`
          : sql`false`
      )
    }
  }

  for (const who of q.assignee) {
    const w = who.toLowerCase()
    if (w === "me") {
      parts.push(assignedToSql(me))
      continue
    }
    if (w === "none" || w === "nobody") {
      parts.push(unassignedSql)
      continue
    }
    const v = like(who)
    parts.push(
      sql`exists (select 1 from conversation_assignees ca join users u on u.id = ca.user_id where ca.conversation_id = ${CONV_ID} and (u.email ilike ${v} or u.name ilike ${v}))`
    )
  }

  if (q.after) parts.push(gte(c.lastActivityAt, q.after))
  if (q.before) parts.push(lte(c.lastActivityAt, q.before))

  return parts.length ? and(...parts)! : sql`true`
}
