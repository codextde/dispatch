import "server-only"
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { publish } from "@/server/realtime"
import type { CannedResponseItem, NotificationPage, RecipientSuggestion } from "@/lib/inbox/types"
import { visibleWhere, type Ctx, type InboxScope } from "./scope"

/* ------------------------------ Notifications ------------------------------ */

export async function listNotifications(ctx: Ctx, opts: { cursor?: string | null; limit?: number; unreadOnly?: boolean }): Promise<NotificationPage> {
  const n = schema.notifications
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)
  let before: Date | null = null
  if (opts.cursor) {
    before = new Date(opts.cursor)
    if (Number.isNaN(before.getTime())) throw new ApiError(400, "Invalid cursor", "invalid_cursor")
  }
  const base = and(eq(n.orgId, ctx.org.id), eq(n.userId, ctx.user.id))
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(n)
      .where(and(base, before ? lt(n.createdAt, before) : undefined, opts.unreadOnly ? isNull(n.readAt) : undefined))
      .orderBy(desc(n.createdAt))
      .limit(limit + 1),
    db.select({ unread: sql<number>`count(*)::int` }).from(n).where(and(base, isNull(n.readAt))),
  ])
  const unread = counts[0]?.unread ?? 0
  const page = rows.slice(0, limit)
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      actorId: r.actorId,
      conversationId: r.conversationId,
      commentId: r.commentId,
      data: r.data,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    unreadCount: unread,
    nextCursor: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null,
  }
}

export async function markNotifications(ctx: Ctx, input: { ids?: string[]; all?: boolean; read: boolean }) {
  const n = schema.notifications
  const base = and(eq(n.orgId, ctx.org.id), eq(n.userId, ctx.user.id))
  const target = input.all ? base : input.ids?.length ? and(base, inArray(n.id, input.ids)) : null
  if (!target) return { updated: 0 }
  const rows = await db
    .update(n)
    .set({ readAt: input.read ? new Date() : null })
    .where(and(target, input.read ? isNull(n.readAt) : undefined))
    .returning({ id: n.id })
  await publish({ orgId: ctx.org.id, type: "notification.created", userIds: [ctx.user.id], actorId: ctx.user.id, data: { read: true } })
  return { updated: rows.length }
}

/* ---------------------------- Recipient search ----------------------------- */

const likeEscape = (v: string) => `%${v.replace(/[\\%_]/g, (m) => `\\${m}`)}%`

/** Address autocomplete: contacts (shared + mine) and participants of visible conversations. */
export async function searchRecipients(ctx: Ctx, scope: InboxScope, q: string, limit = 8): Promise<RecipientSuggestion[]> {
  const query = q.trim().slice(0, 100)
  if (!query) return []
  const v = likeEscape(query)
  const out = new Map<string, RecipientSuggestion>()
  const contacts = await db
    .select({ name: schema.contacts.name, email: schema.contacts.email })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.orgId, ctx.org.id),
        or(isNull(schema.contacts.ownerUserId), eq(schema.contacts.ownerUserId, ctx.user.id)),
        or(ilike(schema.contacts.email, v), ilike(schema.contacts.name, v))
      )
    )
    .orderBy(desc(schema.contacts.lastContactedAt), desc(schema.contacts.messageCount))
    .limit(limit)
  for (const c of contacts) out.set(c.email.toLowerCase(), { name: c.name, email: c.email, source: "contact" })

  if (out.size < limit) {
    const rows = await db.execute<{ name: string | null; email: string }>(sql`
      select distinct on (lower(p->>'email')) p->>'name' as name, p->>'email' as email
      from (
        select conversations.participants, conversations.last_activity_at from conversations
        where ${visibleWhere(ctx, scope)} and conversations.kind = 'email'
        order by conversations.last_activity_at desc
        limit 2000
      ) recent, jsonb_array_elements(recent.participants) p
      where (p->>'email') ilike ${v} or (p->>'name') ilike ${v}
      limit ${limit * 2}`)
    for (const r of rows) {
      const key = r.email?.toLowerCase()
      if (key && !out.has(key)) out.set(key, { name: r.name || null, email: r.email, source: "participant" })
    }
  }
  return [...out.values()].slice(0, limit)
}

/* ---------------------------- Canned responses ----------------------------- */

/** Canned responses available to the user: personal, their teams' and org-wide. */
export async function listResponses(ctx: Ctx, scope: InboxScope): Promise<CannedResponseItem[]> {
  const r = schema.cannedResponses
  const rows = await db
    .select()
    .from(r)
    .where(
      and(
        eq(r.orgId, ctx.org.id),
        or(
          eq(r.ownerUserId, ctx.user.id),
          and(isNull(r.ownerUserId), isNull(r.teamId)),
          scope.teamIds.length ? and(isNull(r.ownerUserId), inArray(r.teamId, scope.teamIds)) : sql`false`
        )
      )
    )
    .orderBy(desc(r.usageCount), r.name)
    .limit(500)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortcut: row.shortcut,
    subject: row.subject,
    body: row.body,
    scope: row.ownerUserId ? "personal" : row.teamId ? "team" : "org",
  }))
}
