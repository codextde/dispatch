import "server-only"
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getViewers } from "@/server/realtime"
import { ApiError } from "@/server/api"
import { parseSearch, hasSearchCriteria } from "@/lib/inbox/search-query"
import type { ListFilters, ParsedBox } from "@/lib/inbox/boxes"
import type {
  AttachmentInfo,
  ComposingKind,
  ConversationDetail,
  ConversationListItem,
  ConversationPage,
  ConversationThread,
  DraftInfo,
  DraftMode,
  Participant,
  ThreadComment,
  ThreadEvent,
  ThreadMessage,
} from "@/lib/inbox/types"
import { CONV_ID, boxBaseSql, listFilterSql, unreadSql } from "./boxes"
import { searchSql } from "./search"
import { levelFor, visibleWhere, type Ctx, type InboxScope } from "./scope"

const c = schema.conversations
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export function attachmentUrl(slug: string, id: string) {
  return `/api/w/${slug}/attachments/${id}`
}

function listColumns(me: string) {
  return {
    id: c.id,
    number: c.number,
    kind: c.kind,
    subject: c.subject,
    customSubject: c.customSubject,
    snippet: c.snippet,
    status: c.status,
    isSpam: c.isSpam,
    isTrash: c.isTrash,
    priority: c.priority,
    snoozedUntil: c.snoozedUntil,
    accountId: c.accountId,
    teamId: c.teamId,
    participants: c.participants,
    messageCount: c.messageCount,
    commentCount: c.commentCount,
    hasAttachments: c.hasAttachments,
    lastActivityAt: c.lastActivityAt,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    chatMemberIds: c.chatMemberIds,
    cursorTs: sql<string>`${c.lastActivityAt}::text`,
    unread: sql<boolean>`${unreadSql(me)}`,
    state: sql<{ starred: boolean; pinned: boolean; following: boolean; muted: boolean } | null>`(select json_build_object('starred', s.starred, 'pinned', s.pinned, 'following', s.following, 'muted', s.muted) from conversation_user_state s where s.conversation_id = ${CONV_ID} and s.user_id = ${me})`,
    assigneeIds: sql<string[]>`coalesce((select array_agg(ca.user_id::text order by ca.created_at) from conversation_assignees ca where ca.conversation_id = ${CONV_ID}), '{}')`,
    labelIds: sql<string[]>`coalesce((select array_agg(cl.label_id::text order by l.position, l.name) from conversation_labels cl join labels l on l.id = cl.label_id where cl.conversation_id = ${CONV_ID} and (l.visibility = 'shared' or l.owner_user_id = ${me})), '{}')`,
    hasDraft: sql<boolean>`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.status = 'draft' and (m.author_id = ${me} or m.is_shared_draft = true))`,
    hasScheduled: sql<boolean>`exists (select 1 from messages m where m.conversation_id = ${CONV_ID} and m.status = 'scheduled')`,
    last: sql<{ name: string | null; email: string; direction: "inbound" | "outbound" } | null>`(select json_build_object('name', m.from_name, 'email', m.from_email, 'direction', m.direction) from messages m where m.conversation_id = ${CONV_ID} and m.status <> 'draft' order by coalesce(m.received_at, m.sent_at, m.send_at, m.created_at) desc limit 1)`,
  }
}

type ListRow = Awaited<ReturnType<typeof selectList>>[number]

function selectList(me: string, where: SQL, order: "newest" | "oldest", limit: number) {
  const dir = order === "oldest" ? asc : desc
  return db
    .select(listColumns(me))
    .from(c)
    .where(where)
    .orderBy(dir(c.lastActivityAt), dir(c.id))
    .limit(limit)
}

/** drizzle's postgres-js driver returns json from raw `sql` selections as text. */
function json<T>(value: T | string | null | undefined): T | null {
  if (value == null) return null
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value
}

export function toListItem(row: ListRow): ConversationListItem {
  const last = json(row.last)
  const state = json(row.state)
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    subject: row.customSubject || row.subject,
    snippet: row.snippet,
    status: row.status,
    isSpam: row.isSpam,
    isTrash: row.isTrash,
    priority: row.priority,
    snoozedUntil: iso(row.snoozedUntil),
    accountId: row.accountId,
    teamId: row.teamId,
    participants: row.participants ?? [],
    lastFrom: last ? { name: last.name, email: last.email } : null,
    lastDirection: last?.direction ?? null,
    messageCount: row.messageCount,
    commentCount: row.commentCount,
    hasAttachments: row.hasAttachments,
    lastActivityAt: iso(row.lastActivityAt)!,
    lastMessageAt: iso(row.lastMessageAt),
    createdAt: iso(row.createdAt)!,
    unread: Boolean(row.unread),
    starred: Boolean(state?.starred),
    pinned: Boolean(state?.pinned),
    following: Boolean(state?.following),
    assigneeIds: row.assigneeIds ?? [],
    labelIds: row.labelIds ?? [],
    hasDraft: Boolean(row.hasDraft),
    hasScheduled: Boolean(row.hasScheduled),
    chatMemberIds: row.chatMemberIds ?? [],
  }
}

function encodeCursor(row: ListRow) {
  return Buffer.from(`${row.cursorTs}|${row.id}`).toString("base64url")
}

function decodeCursor(cursor: string): { ts: string; id: string } {
  try {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|")
    if (!ts || !id || !/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(Date.parse(ts.replace(" ", "T")))) throw new Error()
    return { ts, id }
  } catch {
    throw new ApiError(400, "Invalid cursor", "invalid_cursor")
  }
}

export async function listConversations(
  ctx: Ctx,
  scope: InboxScope,
  opts: { box: ParsedBox; filters: ListFilters; cursor?: string | null; limit?: number }
): Promise<ConversationPage> {
  const me = ctx.user.id
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
  const order = opts.filters.sort ?? "newest"
  const conditions: (SQL | undefined)[] = [visibleWhere(ctx, scope), boxBaseSql(ctx, scope, opts.box), listFilterSql(ctx, opts.box, opts.filters)]

  if (opts.box.kind === "static" && opts.box.id === "search") {
    const parsed = parseSearch(opts.filters.q ?? "")
    if (!hasSearchCriteria(parsed)) return { items: [], nextCursor: null }
    conditions.push(await searchSql(ctx, parsed))
  }

  const pinnedFirst = opts.box.kind !== "static" || !["search", "trash", "spam", "chats"].includes(opts.box.id)
  const pinnedSql = sql`exists (select 1 from conversation_user_state s where s.conversation_id = ${CONV_ID} and s.user_id = ${me} and s.pinned = true)`

  let pinned: ListRow[] = []
  if (opts.cursor) {
    const cur = decodeCursor(opts.cursor)
    conditions.push(
      order === "oldest"
        ? sql`(${c.lastActivityAt}, ${c.id}) > (${cur.ts}::timestamptz, ${cur.id}::uuid)`
        : sql`(${c.lastActivityAt}, ${c.id}) < (${cur.ts}::timestamptz, ${cur.id}::uuid)`
    )
  } else if (pinnedFirst && order === "newest") {
    pinned = await selectList(me, and(...conditions, pinnedSql)!, order, 25)
  }
  if (pinnedFirst && order === "newest") conditions.push(sql`not ${pinnedSql}`)

  const rows = await selectList(me, and(...conditions)!, order, limit + 1)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return {
    items: [...pinned, ...page].map(toListItem),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  }
}

/** A single list item (e.g. after a mutation), or null if not visible. */
export async function getListItem(ctx: Ctx, scope: InboxScope, id: string): Promise<ConversationListItem | null> {
  const rows = await selectList(ctx.user.id, and(eq(c.id, id), visibleWhere(ctx, scope))!, "newest", 1)
  return rows[0] ? toListItem(rows[0]) : null
}

/* --------------------------------- Thread --------------------------------- */

export function toAttachmentInfo(slug: string, a: typeof schema.attachments.$inferSelect): AttachmentInfo {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    isInline: a.isInline,
    url: attachmentUrl(slug, a.id),
  }
}

export function messageDate(m: Pick<typeof schema.messages.$inferSelect, "receivedAt" | "sentAt" | "sendAt" | "createdAt">) {
  return (m.receivedAt ?? m.sentAt ?? m.sendAt ?? m.createdAt).toISOString()
}

export function toThreadMessage(
  slug: string,
  m: typeof schema.messages.$inferSelect,
  atts: (typeof schema.attachments.$inferSelect)[]
): ThreadMessage {
  return {
    id: m.id,
    direction: m.direction,
    status: m.status,
    fromName: m.fromName,
    fromEmail: m.fromEmail,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    replyTo: m.replyTo,
    subject: m.subject,
    snippet: m.snippet,
    hasBody: Boolean(m.htmlBody || m.textBody),
    accountId: m.accountId,
    authorId: m.authorId,
    messageId: m.messageId,
    sendAt: iso(m.sendAt),
    sentAt: iso(m.sentAt),
    sendError: m.sendError,
    date: messageDate(m),
    attachments: atts.map((a) => toAttachmentInfo(slug, a)),
  }
}

export const DRAFT_MODE_HEADER = "x-dispatch-mode"

export function toDraftInfo(slug: string, m: typeof schema.messages.$inferSelect, atts: (typeof schema.attachments.$inferSelect)[]): DraftInfo {
  const mode = (m.headers?.[DRAFT_MODE_HEADER] as DraftMode | undefined) ?? (m.replyToMessageId ? "reply" : "new")
  return {
    id: m.id,
    conversationId: m.conversationId,
    authorId: m.authorId,
    isShared: m.isSharedDraft,
    version: m.draftVersion,
    lastEditedBy: m.lastEditedBy,
    updatedAt: m.updatedAt.toISOString(),
    mode,
    replyToMessageId: m.replyToMessageId,
    accountId: m.accountId,
    fromEmail: m.fromEmail,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    subject: m.subject,
    html: m.htmlBody ?? "",
    attachments: atts.map((a) => toAttachmentInfo(slug, a)),
  }
}

export async function getThread(ctx: Ctx, scope: InboxScope, id: string): Promise<ConversationThread | null> {
  const me = ctx.user.id
  const slug = ctx.org.slug
  const [row] = await selectList(me, and(eq(c.id, id), visibleWhere(ctx, scope))!, "newest", 1)
  if (!row) return null
  const [conv] = await db.select().from(c).where(eq(c.id, id)).limit(1)
  if (!conv) return null

  const [msgs, comments, events] = await Promise.all([
    db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, id),
          or(
            and(ne(schema.messages.status, "draft"), ne(schema.messages.status, "queued")),
            and(eq(schema.messages.status, "queued"), eq(schema.messages.authorId, me)),
            and(eq(schema.messages.status, "draft"), or(eq(schema.messages.authorId, me), eq(schema.messages.isSharedDraft, true)))
          )
        )
      )
      .orderBy(asc(sql`coalesce(${schema.messages.receivedAt}, ${schema.messages.sentAt}, ${schema.messages.sendAt}, ${schema.messages.createdAt})`)),
    db
      .select()
      .from(schema.comments)
      .where(and(eq(schema.comments.conversationId, id), isNull(schema.comments.deletedAt)))
      .orderBy(asc(schema.comments.createdAt)),
    db
      .select()
      .from(schema.conversationEvents)
      .where(eq(schema.conversationEvents.conversationId, id))
      .orderBy(asc(schema.conversationEvents.createdAt))
      .limit(500),
  ])

  const messageIds = msgs.map((m) => m.id)
  const commentIds = comments.map((cm) => cm.id)
  const [atts, reactions] = await Promise.all([
    messageIds.length || commentIds.length
      ? db
          .select()
          .from(schema.attachments)
          .where(
            and(
              eq(schema.attachments.orgId, ctx.org.id),
              or(
                messageIds.length ? inArray(schema.attachments.messageId, messageIds) : sql`false`,
                commentIds.length ? inArray(schema.attachments.commentId, commentIds) : sql`false`
              )
            )
          )
          .orderBy(asc(schema.attachments.createdAt))
      : Promise.resolve([]),
    commentIds.length
      ? db.select().from(schema.reactions).where(inArray(schema.reactions.commentId, commentIds)).orderBy(asc(schema.reactions.createdAt))
      : Promise.resolve([]),
  ])

  const attsByMessage = new Map<string, (typeof atts)[number][]>()
  const attsByComment = new Map<string, (typeof atts)[number][]>()
  for (const a of atts) {
    if (a.messageId) (attsByMessage.get(a.messageId) ?? attsByMessage.set(a.messageId, []).get(a.messageId)!).push(a)
    else if (a.commentId) (attsByComment.get(a.commentId) ?? attsByComment.set(a.commentId, []).get(a.commentId)!).push(a)
  }

  const messages: ThreadMessage[] = []
  const drafts: DraftInfo[] = []
  for (const m of msgs) {
    if (m.status === "draft") drafts.push(toDraftInfo(slug, m, attsByMessage.get(m.id) ?? []))
    else messages.push(toThreadMessage(slug, m, attsByMessage.get(m.id) ?? []))
  }

  const threadComments: ThreadComment[] = comments.map((cm) => {
    const groups = new Map<string, string[]>()
    for (const r of reactions) if (r.commentId === cm.id) (groups.get(r.emoji) ?? groups.set(r.emoji, []).get(r.emoji)!).push(r.userId)
    return {
      id: cm.id,
      authorId: cm.authorId,
      body: cm.body,
      mentions: cm.mentions,
      parentId: cm.parentId,
      editedAt: iso(cm.editedAt),
      deletedAt: iso(cm.deletedAt),
      createdAt: cm.createdAt.toISOString(),
      reactions: [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
      attachments: (attsByComment.get(cm.id) ?? []).map((a) => toAttachmentInfo(slug, a)),
    }
  })

  const threadEvents: ThreadEvent[] = events.map((e) => ({
    id: e.id,
    actorId: e.actorId,
    type: e.type,
    data: e.data,
    createdAt: e.createdAt.toISOString(),
  }))

  const state = json(row.state)
  const detail: ConversationDetail = {
    ...toListItem(row),
    rawSubject: conv.subject,
    customSubject: conv.customSubject,
    level: levelFor(ctx, scope, conv),
    closedAt: iso(conv.closedAt),
    closedBy: conv.closedBy,
    createdBy: conv.createdBy,
    muted: Boolean(state?.muted),
    firstResponseAt: iso(conv.firstResponseAt),
    mergedIntoId: conv.mergedIntoId,
  }

  return {
    conversation: detail,
    messages,
    comments: threadComments,
    events: threadEvents,
    drafts,
    viewers: getViewers(ctx.org.id, id).map((v) => ({ userId: v.userId, composing: (v.composing || null) as ComposingKind })),
  }
}

/** Merge participants (deduplicated by lowercase email). */
export function mergeParticipants(existing: Participant[], add: Participant[], exclude: string[] = []): Participant[] {
  const skip = new Set(exclude.map((e) => e.toLowerCase()))
  const out = new Map<string, Participant>()
  for (const p of [...existing, ...add]) {
    const key = p.email?.toLowerCase()
    if (!key || skip.has(key)) continue
    const prev = out.get(key)
    out.set(key, { email: p.email, name: p.name || prev?.name || null })
  }
  return [...out.values()].slice(0, 50)
}
