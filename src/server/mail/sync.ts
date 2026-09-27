import "server-only"
import type { FetchMessageObject, ImapFlow, MailboxObject } from "imapflow"
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { Account } from "@/server/db/schema"
import { publish } from "@/server/realtime"
import { audit } from "@/server/audit"
import { ingestRawMessage, type FolderRole } from "./ingest"
import { cleanMessageId, placeholderSource, withDeadline } from "./parse"
import type { MailboxPaths } from "./connection"

/**
 * IMAP mailbox synchronization (one mailbox at a time, on an already
 * connected client). The connection lifecycle lives in src/worker/accounts.ts.
 *
 *  - Initial backfill: messages of the last `config.syncDays` (default 30)
 *    days, capped per folder, oldest first so threads build naturally.
 *  - Incremental: UIDs above the stored cursor (mailbox_sync_state).
 *  - UIDVALIDITY change: stored UIDs are invalidated and the window is
 *    re-scanned (messages dedupe by Message-ID, so nothing is duplicated).
 *
 * Failure policy: mail is never skipped because of an outage or a bug — the
 * error propagates, the cursor stays and the pass is retried. Only messages
 * that fail with a message-specific data error (see `isPoisonError`) are
 * skipped after 3 attempts, and that is recorded in the audit log.
 */

export type SyncLogger = {
  info: (msg: string, fields?: Record<string, unknown>) => void
  warn: (msg: string, fields?: Record<string, unknown>) => void
  error: (msg: string, fields?: Record<string, unknown>) => void
}

export const DEFAULT_SYNC_DAYS = 30
const MAX_SYNC_DAYS = 365
const BACKFILL_CAP: Record<FolderRole, number> = { inbox: 1000, sent: 500, junk: 100, other: 200 }
const BATCH_MAX_MESSAGES = 25
const BATCH_MAX_BYTES = 25 * 1024 * 1024
const MAX_MESSAGE_BYTES = 50 * 1024 * 1024
/** Incremental messages older than this are imported quietly (no rules/notifications). */
const LIVE_MAX_AGE_MS = 3 * 86_400_000
const MAX_UID_FAILURES = 3

export type MailboxSyncResult = {
  mode: "initial" | "incremental" | "none"
  fetched: number
  created: number
}

/**
 * Hard limit for storing one message. Parsing has its own, shorter deadline;
 * this one only guards against a hanging database or storage backend, so it
 * is not a poison error: the pass is retried later and no mail is skipped.
 */
const INGEST_TIMEOUT_MS = 5 * 60_000

class IngestTimeoutError extends Error {
  code = "EINGESTTIMEOUT"
  constructor() {
    super(`Storing the message took longer than ${INGEST_TIMEOUT_MS / 60_000} minutes`)
  }
}

/**
 * Parser timeouts and filesystem errors caused by one message's content
 * (e.g. an attachment named "..").
 */
const POISON_CODES = new Set(["EPARSETIMEOUT", "EISDIR", "ENOTDIR", "ENAMETOOLONG", "EINVALIDKEY"])

/**
 * Errors caused by the content of one message (Postgres data exceptions
 * 22xxx, program limits 54xxx such as an oversized index row, `POISON_CODES`)
 * — retrying the same message can never succeed.
 */
export function isPoisonError(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } }
  const code = typeof e?.cause?.code === "string" ? e.cause.code : typeof e?.code === "string" ? e.code : ""
  return /^(22|54)[0-9A-Z]{3}$/.test(code) || POISON_CODES.has(code) || err instanceof RangeError
}

/** Global cap on raw message bytes held in memory by all mailbox syncs together. */
class ByteBudget {
  private used = 0
  private waiters: (() => void)[] = []
  constructor(private readonly max: number) {}
  async acquire(bytes: number): Promise<() => void> {
    const n = Math.min(Math.max(bytes, 0), this.max)
    while (this.used > 0 && this.used + n > this.max) await new Promise<void>((r) => this.waiters.push(r))
    this.used += n
    let released = false
    return () => {
      if (released) return
      released = true
      this.used -= n
      this.waiters.splice(0).forEach((w) => w())
    }
  }
}
const fetchBudget = new ByteBudget(150 * 1024 * 1024)

export type SyncContext = {
  client: ImapFlow
  account: Account
  log: SyncLogger
  /** per "mailbox:uid" failure counts (poison-message protection) */
  failures: Map<string, number>
}

function syncWindowStart(account: Account): Date {
  const days = Math.min(Math.max(Math.round(account.config.syncDays ?? DEFAULT_SYNC_DAYS), 1), MAX_SYNC_DAYS)
  const byDays = new Date(Date.now() - days * 86_400_000)
  if (account.syncFromDate && account.syncFromDate > byDays) return account.syncFromDate
  return byDays
}

function toDate(v: Date | string | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Replace the body of an oversized message with a short note (headers are kept). */
function oversizedSource(headers: Buffer | undefined, size: number): Buffer {
  const mb = Math.round(size / 1024 / 1024)
  return placeholderSource(headers?.toString("utf8") ?? "", `This message is too large to import (${mb} MB). Open it in your email client to read it.`)
}

type Candidate = { uid: number; size: number; messageId: string | null; internalDate: Date | null; threadId?: string; flags?: Set<string> }

/** Sync one mailbox. Throws on connection/database errors so the caller can reconnect. */
export async function syncMailbox(ctx: SyncContext, path: string, role: FolderRole): Promise<MailboxSyncResult> {
  const { client, account, log } = ctx
  const result: MailboxSyncResult = { mode: "none", fetched: 0, created: 0 }
  let lock
  try {
    lock = await client.getMailboxLock(path)
  } catch (err) {
    if ((err as { mailboxMissing?: boolean }).mailboxMissing) {
      log.warn("mailbox not found, skipping", { mailbox: path })
      return result
    }
    throw err
  }
  try {
    const mb = client.mailbox as MailboxObject
    const uidValidity = Number(mb.uidValidity)
    const uidNext = mb.uidNext
    const state = await db.query.mailboxSyncState.findFirst({
      where: and(eq(schema.mailboxSyncState.accountId, account.id), eq(schema.mailboxSyncState.mailbox, path)),
    })

    const initial = !state || state.uidValidity !== uidValidity
    let uids: number[]
    if (initial) {
      result.mode = "initial"
      if (state) {
        log.warn("UIDVALIDITY changed, rescanning mailbox", { mailbox: path, from: state.uidValidity, to: uidValidity })
        // Stored UIDs of this mailbox are meaningless now
        await db
          .update(schema.messages)
          .set({ imapUid: null })
          .where(and(eq(schema.messages.accountId, account.id), eq(schema.messages.imapMailbox, path)))
      }
      let found: number[] = []
      if (mb.exists > 0) {
        const res = await client.search({ since: syncWindowStart(account) }, { uid: true })
        // imapflow returns false instead of throwing when SEARCH fails
        if (!Array.isArray(res)) throw new Error(`IMAP SEARCH failed for ${path}`)
        found = res
      }
      uids = [...found].sort((a, b) => a - b).slice(-BACKFILL_CAP[role])
    } else {
      // Note: `uidNext` of an already selected mailbox is not refreshed by EXISTS
      // responses (IDLE), so always ask the server. "n:*" returns at least the
      // last message, hence the filter.
      const fetched = mb.exists > 0 ? await client.fetchAll(`${state.lastUid + 1}:*`, { uid: true }, { uid: true }) : []
      uids = fetched.map((m) => m.uid).filter((u) => u > state.lastUid).sort((a, b) => a - b)
      if (!uids.length) return result
      result.mode = "incremental"
    }

    // Cursor for the end of this pass (initial: everything that exists now)
    const endCursor = initial ? Math.max(uidNext - 1, 0) : state!.lastUid
    const mode = initial ? "backfill" : "live"
    let cursor = initial ? 0 : state!.lastUid

    for (let i = 0; i < uids.length; i += 200) {
      const chunk = uids.slice(i, i + 200)
      const candidates = await describe(ctx, chunk)
      const missing = await filterUnknown(account.id, candidates)
      for (const batch of batches(missing)) {
        await ingestBatch(ctx, path, role, batch, mode, result)
        if (!initial) {
          cursor = Math.max(cursor, ...batch.map((b) => b.uid))
          await saveCursor(account.id, path, uidValidity, cursor)
        }
      }
      if (!initial) {
        cursor = Math.max(cursor, ...chunk)
        await saveCursor(account.id, path, uidValidity, cursor)
      }
    }
    await saveCursor(account.id, path, uidValidity, Math.max(cursor, endCursor, ...(uids.length ? [uids[uids.length - 1]!] : [])))
    return result
  } finally {
    lock.release()
  }
}

async function saveCursor(accountId: string, mailbox: string, uidValidity: number, lastUid: number) {
  await db
    .insert(schema.mailboxSyncState)
    .values({ accountId, mailbox, uidValidity, lastUid })
    .onConflictDoUpdate({
      target: [schema.mailboxSyncState.accountId, schema.mailboxSyncState.mailbox],
      set: { uidValidity, lastUid, updatedAt: new Date() },
    })
}

/** Cheap metadata fetch (no bodies) used to skip messages we already have. */
async function describe(ctx: SyncContext, uids: number[]): Promise<Candidate[]> {
  if (!uids.length) return []
  const gmail = ctx.client.capabilities.has("X-GM-EXT-1")
  const rows: FetchMessageObject[] = await ctx.client.fetchAll(
    uids.join(","),
    { uid: true, size: true, envelope: true, internalDate: true, flags: true, ...(gmail ? { threadId: true } : {}) },
    { uid: true }
  )
  return rows
    .map((r) => ({
      uid: r.uid,
      size: r.size ?? 0,
      messageId: cleanMessageId(r.envelope?.messageId),
      internalDate: toDate(r.internalDate),
      threadId: r.threadId,
      flags: r.flags,
    }))
    .sort((a, b) => a.uid - b.uid)
}

async function filterUnknown(accountId: string, candidates: Candidate[]): Promise<Candidate[]> {
  const ids = candidates.map((c) => c.messageId).filter((id): id is string => Boolean(id))
  if (!ids.length) return candidates
  const known = await db
    .select({ messageId: schema.messages.messageId, imapUid: schema.messages.imapUid, id: schema.messages.id })
    .from(schema.messages)
    .where(and(eq(schema.messages.accountId, accountId), inArray(schema.messages.messageId, ids)))
  const knownIds = new Set(known.map((k) => k.messageId))
  return candidates.filter((c) => !c.messageId || !knownIds.has(c.messageId))
}

function* batches(list: Candidate[]): Generator<Candidate[]> {
  let batch: Candidate[] = []
  let bytes = 0
  for (const c of list) {
    const size = Math.min(c.size, MAX_MESSAGE_BYTES)
    if (batch.length && (batch.length >= BATCH_MAX_MESSAGES || bytes + size > BATCH_MAX_BYTES)) {
      yield batch
      batch = []
      bytes = 0
    }
    batch.push(c)
    bytes += size
  }
  if (batch.length) yield batch
}

async function ingestBatch(
  ctx: SyncContext,
  path: string,
  role: FolderRole,
  batch: Candidate[],
  mode: "backfill" | "live",
  result: MailboxSyncResult
) {
  const { client, account, log, failures } = ctx
  const normal = batch.filter((c) => c.size <= MAX_MESSAGE_BYTES)
  const oversized = batch.filter((c) => c.size > MAX_MESSAGE_BYTES)
  const release = await fetchBudget.acquire(normal.reduce((sum, c) => sum + c.size, 0))
  try {
    const sources = new Map<number, Buffer>()
    if (normal.length) {
      const rows = await client.fetchAll(normal.map((c) => c.uid).join(","), { uid: true, source: true }, { uid: true })
      for (const r of rows) if (r.source) sources.set(r.uid, r.source)
    }
    for (const c of oversized) {
      const r = await client.fetchOne(String(c.uid), { uid: true, headers: true }, { uid: true })
      sources.set(c.uid, oversizedSource(r ? r.headers : undefined, c.size))
    }

    for (const c of batch) {
      const source = sources.get(c.uid)
      if (!source) continue
      const key = `${path}:${c.uid}`
      if ((failures.get(key) ?? 0) >= MAX_UID_FAILURES) continue
      result.fetched++
      const liveEligible = mode === "live" && (!c.internalDate || Date.now() - c.internalDate.getTime() < LIVE_MAX_AGE_MS)
      try {
        // A hung ingest must not hold the fetch budget or the worker's import slot forever
        const res = await withDeadline(
          ingestRawMessage({
            account,
            source,
            mailbox: path,
            uid: c.uid,
            folderRole: role,
            internalDate: c.internalDate,
            flags: c.flags,
            gmailThreadId: c.threadId ?? null,
            mode: liveEligible ? "live" : "backfill",
          }),
          INGEST_TIMEOUT_MS,
          () => new IngestTimeoutError()
        )
        if (res.status === "created") result.created++
        else if (res.status === "skipped") log.warn("message skipped", { mailbox: path, uid: c.uid, reason: res.reason })
        failures.delete(key)
      } catch (err) {
        // Outages and bugs: keep the cursor, retry the whole pass later
        if (!isPoisonError(err)) throw err
        const n = (failures.get(key) ?? 0) + 1
        failures.set(key, n)
        if (n < MAX_UID_FAILURES) throw err
        log.error("skipping message that cannot be stored", { mailbox: path, uid: c.uid, error: errMessage(err) })
        await audit({
          orgId: account.orgId,
          action: "inbox.message_skipped",
          targetType: "account",
          targetId: account.id,
          metadata: { mailbox: path, uid: c.uid, messageId: c.messageId, error: errMessage(err).slice(0, 500) },
        })
      }
    }
  } finally {
    release()
  }

  if (mode === "backfill" && result.created) {
    await publish({ orgId: account.orgId, type: "conversation.created", data: { accountId: account.id, batch: true } })
  }
}

function errMessage(err: unknown) {
  const cause = (err as { cause?: { message?: string } })?.cause?.message
  return cause ?? (err instanceof Error ? err.message : String(err))
}

/**
 * After an initial import, threads where we had the last word are closed
 * (nothing is waiting for a reply); threads awaiting a reply stay open.
 * Only untouched conversations (no events, assignees or comments) qualify, so
 * a retried import never closes something a teammate is working on.
 */
export async function closeAnsweredConversations(accountId: string) {
  await db.execute(sql`
    update conversations c set status = 'closed', closed_at = coalesce(c.last_outbound_at, now())
    where c.account_id = ${accountId} and c.status = 'open' and c.closed_by is null
      and c.last_outbound_at is not null
      and (c.last_inbound_at is null or c.last_outbound_at >= c.last_inbound_at)
      and not exists (select 1 from conversation_events e where e.conversation_id = c.id)
      and not exists (select 1 from conversation_assignees a where a.conversation_id = c.id)
      and not exists (select 1 from comments m where m.conversation_id = c.id)
  `)
}

/* ------------------------------- Two-way sync ------------------------------- */

export type ReconcileState = { readWatermark: Date; archiveWatermark: Date }

/**
 * Mirror Dispatch state back to the server (opt-in per inbox):
 *  - `markReadOnServer`: flag INBOX copies \Seen once a reader opened the conversation
 *  - `syncArchive`: move INBOX copies of conversations closed by a teammate to the archive folder
 */
export async function reconcileServerState(ctx: SyncContext, paths: MailboxPaths, state: ReconcileState) {
  const { client, account, log } = ctx
  const inbox = paths.inbox

  if (account.config.markReadOnServer) {
    const since = state.readWatermark
    const startedAt = new Date()
    const limit = 1000
    const ownerFilter = account.ownerUserId ? sql`and s.user_id = ${account.ownerUserId}` : sql``
    const rows = await db.execute<{ imap_uid: number }>(sql`
      select distinct m.imap_uid
      from messages m
      join conversation_user_state s on s.conversation_id = m.conversation_id
      where m.account_id = ${account.id} and m.imap_mailbox = ${inbox} and m.imap_uid is not null
        and m.direction = 'inbound' and s.last_read_at is not null
        and s.last_read_at >= coalesce(m.received_at, m.created_at)
        and s.updated_at > ${since.toISOString()}::timestamptz
        ${ownerFilter}
      limit ${limit}
    `)
    const uids = rows.map((r) => Number(r.imap_uid)).filter(Boolean)
    if (uids.length) {
      const lock = await client.getMailboxLock(inbox)
      try {
        await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true })
        log.info("marked messages read on server", { count: uids.length })
      } finally {
        lock.release()
      }
    }
    // Only move on once everything up to now was flagged
    if (rows.length < limit) state.readWatermark = startedAt
  }

  if (account.config.syncArchive && paths.archive && paths.archive !== inbox) {
    const startedAt = new Date()
    const rows = await db
      .select({ id: schema.messages.id, uid: schema.messages.imapUid })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(
        and(
          eq(schema.messages.accountId, account.id),
          eq(schema.messages.imapMailbox, inbox),
          isNotNull(schema.messages.imapUid),
          eq(schema.conversations.status, "closed"),
          // closed by a person (not by the import) after this worker session started watching
          isNotNull(schema.conversations.closedBy),
          gt(schema.conversations.closedAt, state.archiveWatermark)
        )
      )
      .limit(500)
    if (rows.length) {
      const lock = await client.getMailboxLock(inbox)
      try {
        const res = await client.messageMove(
          rows.map((r) => r.uid!),
          paths.archive,
          { uid: true }
        )
        // imapflow returns false instead of throwing when MOVE fails
        if (!res) throw new Error(`IMAP MOVE to ${paths.archive} failed`)
        for (const r of rows) {
          const newUid = res && res.uidMap ? (res.uidMap.get(r.uid!) ?? null) : null
          await db
            .update(schema.messages)
            .set({ imapMailbox: paths.archive, imapUid: newUid })
            .where(eq(schema.messages.id, r.id))
        }
        log.info("archived messages on server", { count: rows.length, to: paths.archive })
      } finally {
        lock.release()
      }
    } else {
      state.archiveWatermark = startedAt
    }
  }
}
