import "server-only"
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { publish } from "@/server/realtime"
import { listMailboxes, type MailboxPaths } from "./connection"
import { cleanMessageId } from "./parse"
import type { SyncContext } from "./sync"

const PAGE_SIZE = 50
const MAX_LOOKUPS = 4
const m = schema.messages
const c = schema.conversations

/** Reconcile a rotating page of imported messages without downloading any content. */
export async function reconcileRemoteMoves(ctx: SyncContext, paths: MailboxPaths, after: string | null) {
  const { client, account } = ctx
  const rows = await db.select({
    id: m.id, messageId: m.messageId, path: m.imapMailbox, uid: m.imapUid, conversationId: m.conversationId,
  }).from(m).where(and(
    eq(m.orgId, account.orgId),
    eq(m.accountId, account.id),
    inArray(m.status, ["received", "sent"]),
    isNotNull(m.messageId),
    isNotNull(m.imapMailbox),
    after ? gt(m.id, after) : undefined,
  )).orderBy(m.id).limit(PAGE_SIZE)
  if (!rows.length) return null

  const listed = await listMailboxes(client)
  const folders = listed
    .filter((folder) => folder.path !== paths.drafts && folder.specialUse !== "\\Drafts")
    .map((folder) => folder.path)
  const selectable = new Set(folders)
  const missing = new Set<string>()
  for (const path of new Set(rows.map((row) => row.path!))) {
    const group = rows.filter((row) => row.path === path)
    if (!selectable.has(path)) {
      for (const row of group) missing.add(row.id)
      continue
    }
    const box = await client.mailboxOpen(path, { readOnly: true })
    const cursor = await db.query.mailboxSyncState.findFirst({
      where: and(eq(schema.mailboxSyncState.accountId, account.id), eq(schema.mailboxSyncState.mailbox, path)),
      columns: { uidValidity: true },
    })
    const canCheckUid = cursor?.uidValidity === Number(box.uidValidity)
    const byUid = new Map<number, { messageId: string | null; seen: boolean | undefined }>()
    const uids = canCheckUid ? group.flatMap((row) => row.uid ? [row.uid] : []) : []
    if (uids.length && box.exists) {
      const observedAt = new Date()
      const found = await client.fetchAll(uids.join(","), { uid: true, envelope: true, flags: true }, { uid: true })
      for (const item of found) {
        byUid.set(item.uid, { messageId: cleanMessageId(item.envelope?.messageId), seen: item.flags?.has("\\Seen") })
      }
      if (path === paths.inbox && account.ownerUserId && account.config.markReadOnServer) {
        const readings = group.flatMap((row) => {
          const item = row.uid ? byUid.get(row.uid) : undefined
          return row.uid && item?.messageId === row.messageId && item.seen !== undefined ? [{ id: row.id, uid: row.uid, seen: item.seen }] : []
        })
        await reconcilePersonalReadState(account.orgId, account.id, account.ownerUserId, path, observedAt, readings)
      }
    }
    for (const row of group) {
      if (!row.uid || byUid.get(row.uid)?.messageId !== row.messageId) missing.add(row.id)
    }
  }

  let lookups = 0
  for (const [index, row] of rows.entries()) {
    if (!missing.has(row.id)) continue
    if (lookups >= MAX_LOOKUPS) return rows[index - 1]?.id ?? after
    lookups++
    const location = await locate(ctx, row.messageId!, row.path!, folders)
    if (!location || (location.path === row.path && location.uid === row.uid)) continue
    const changed = await db.transaction(async (tx) => {
      const [updated] = await tx.update(m).set({ imapMailbox: location.path, imapUid: location.uid })
        .where(and(eq(m.id, row.id), eq(m.orgId, account.orgId), eq(m.accountId, account.id),
          sql`${m.imapMailbox} is not distinct from ${row.path}`, sql`${m.imapUid} is not distinct from ${row.uid}`))
        .returning({ conversationId: m.conversationId })
      if (!updated) return false
      if (location.path === paths.trash || row.path === paths.trash) {
        // A single message can move independently of the rest of a thread.
        await tx.update(c).set({ isTrash: location.path === paths.trash })
          .where(and(eq(c.orgId, account.orgId), eq(c.accountId, account.id), eq(c.id, updated.conversationId), eq(c.messageCount, 1)))
      }
      return true
    })
    if (changed) await publish({ orgId: account.orgId, type: "conversation.updated", conversationId: row.conversationId })
  }
  return rows.length === PAGE_SIZE ? rows.at(-1)!.id : null
}

async function locate({ client, account }: SyncContext, messageId: string, source: string, folders: string[]) {
  const ordered = folders.includes(source) ? [source, ...folders.filter((path) => path !== source)] : folders
  let destination: { path: string; uid: number | null } | null = null
  for (const path of ordered) {
    const box = await client.mailboxOpen(path, { readOnly: true })
    if (!box.exists) continue
    const matches = await client.search({ header: { "Message-ID": `<${messageId}>` } }, { uid: true })
    if (!Array.isArray(matches)) throw new Error("Could not search the mailbox for a moved message")
    if (matches.length > 25) return null
    if (!matches.length) continue
    const items = await client.fetchAll(matches.join(","), { uid: true, envelope: true }, { uid: true })
    const exact = items.filter((item) => cleanMessageId(item.envelope?.messageId) === messageId)
    if (exact.length > 1) return null
    if (!exact.length) continue
    if (destination) return null
    // The normal worker uses the sync cursor to validate UIDs. A folder
    // without a cursor can still be recorded, with its UID resolved on demand.
    const state = await db.query.mailboxSyncState.findFirst({
      where: and(eq(schema.mailboxSyncState.accountId, account.id), eq(schema.mailboxSyncState.mailbox, path)),
      columns: { uidValidity: true },
    })
    destination = { path, uid: state?.uidValidity === Number(box.uidValidity) ? exact[0]!.uid : null }
    if (path === source) return destination
  }
  return destination
}

async function reconcilePersonalReadState(
  orgId: string, accountId: string, ownerId: string, mailbox: string, observedAt: Date, readings: { id: string; uid: number; seen: boolean }[]
) {
  if (!readings.length) return
  const values = sql.join(readings.map(({ id, uid, seen }) => sql`(${id}::uuid, ${uid}::bigint, ${seen}::boolean)`), sql`, `)
  const changed = await db.execute<{ conversation_id: string }>(sql`
    insert into conversation_user_state (conversation_id, user_id, last_read_at, unread, updated_at)
    select c.id, ${ownerId}::uuid, case when r.seen then greatest(c.last_activity_at, ${observedAt}) end, not r.seen, ${observedAt}
    from (values ${values}) as r(message_id, uid, seen)
    join messages m on m.id = r.message_id and m.org_id = ${orgId} and m.account_id = ${accountId}
    join conversations c on c.id = m.conversation_id and c.org_id = m.org_id and c.account_id = m.account_id
    left join conversation_user_state s on s.conversation_id = c.id and s.user_id = ${ownerId}
    where m.direction = 'inbound' and m.status = 'received' and c.message_count = 1
      and m.imap_mailbox = ${mailbox} and m.imap_uid = r.uid
      and c.merged_into_id is null and c.last_activity_at <= ${observedAt}
      and (s.updated_at is null or s.updated_at <= ${observedAt})
      and (s.last_read_at is not null and s.last_read_at >= c.last_activity_at) <> r.seen
    on conflict (conversation_id, user_id) do update set
      last_read_at = excluded.last_read_at, unread = excluded.unread, updated_at = excluded.updated_at
    where conversation_user_state.updated_at <= excluded.updated_at
    returning conversation_id
  `)
  if (changed.length) await publish({ orgId, type: "conversation.updated", userIds: [ownerId] })
}
