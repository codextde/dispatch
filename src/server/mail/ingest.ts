import "server-only"
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema, type Tx } from "@/server/db"
import type { Account, Conversation, Message, OrgSettings, Participant } from "@/server/db/schema"
import { nextConversationNumber } from "@/server/orgs"
import { deleteObject, makeStorageKey, putObject } from "@/server/storage"
import { publish } from "@/server/realtime"
import { emitWebhook } from "@/server/jobs"
import { notify } from "@/server/notifications"
import { upsertContactsFromParticipants } from "@/server/contacts"
import { runRules } from "@/server/rules/engine"
import { autoAssignToTeam, isAssignStrategy } from "@/server/rules/assign"
import { conversationPayload, messagePayload, refreshConversationStats } from "./conversation-stats"
import { hasReplyPrefix, mergeParticipants, normalizeEmail, normalizeSubject, parseRawEmail, stripReplyPrefixes, type ParsedEmail } from "./parse"

/**
 * Ingest a raw email fetched from IMAP into Dispatch:
 *  parse → dedupe → thread → store (conversation, message, attachments) →
 *  side effects (rules, auto-assignment, notifications, realtime, webhooks).
 *
 * Idempotent: messages are unique per (account, Message-ID); re-syncing a
 * mailbox never creates duplicates.
 */

export type FolderRole = "inbox" | "sent" | "junk" | "other"

export type IngestInput = {
  account: Account
  source: Buffer
  mailbox: string
  uid?: number | null
  folderRole?: FolderRole
  internalDate?: Date | null
  flags?: Set<string> | string[]
  gmailThreadId?: string | null
  /** Force the direction (otherwise derived from the From address) */
  direction?: "inbound" | "outbound"
  /** backfill: initial import — no rules, notifications, webhooks or realtime */
  mode?: "live" | "backfill"
}

export type IngestResult =
  | {
      status: "created"
      messageDbId: string
      conversationId: string
      conversationCreated: boolean
      direction: "inbound" | "outbound"
    }
  | { status: "duplicate"; messageDbId: string; conversationId: string }
  | { status: "skipped"; reason: string }

const THREAD_SUBJECT_WINDOW_MS = 7 * 86_400_000
const MAX_PARTICIPANTS = 50
const MAX_FUTURE_SKEW_MS = 5 * 60_000

class DuplicateMessage extends Error {}

export function ownAddresses(account: Pick<Account, "email" | "aliases">): Set<string> {
  return new Set([account.email, ...(account.aliases ?? [])].map(normalizeEmail).filter(Boolean))
}

function clampDate(d: Date | null | undefined): Date | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const max = Date.now() + MAX_FUTURE_SKEW_MS
  if (d.getTime() > max) return new Date()
  if (d.getFullYear() < 1990) return null
  return d
}

/** Follow merges to the surviving conversation. */
async function resolveMerged(conversationId: string): Promise<string | null> {
  let id: string | null = conversationId
  for (let i = 0; i < 5 && id; i++) {
    const row: { id: string; mergedIntoId: string | null } | undefined = await db.query.conversations.findFirst({
      where: eq(schema.conversations.id, id),
      columns: { id: true, mergedIntoId: true },
    })
    if (!row) return null
    if (!row.mergedIntoId) return row.id
    id = row.mergedIntoId
  }
  return id
}

/**
 * Find the conversation a message belongs to (same account only, so a
 * message never leaks into a conversation of an inbox with different access):
 *  1. In-Reply-To / References → any message we know (incl. our own outbound)
 *  2. A known message replying to this one (messages synced out of order)
 *  3. Gmail thread id (X-GM-THRID)
 *  4. Reply-prefixed subject + shared external participant within 7 days
 */
async function findConversation(
  account: Account,
  parsed: ParsedEmail,
  externals: Participant[],
  gmailThreadId: string | null | undefined,
  date: Date
): Promise<string | null> {
  const m = schema.messages
  if (parsed.references.length) {
    const [hit] = await db
      .select({ conversationId: m.conversationId })
      .from(m)
      .where(and(eq(m.orgId, account.orgId), eq(m.accountId, account.id), inArray(m.messageId, parsed.references)))
      .orderBy(desc(m.createdAt))
      .limit(1)
    if (hit) return resolveMerged(hit.conversationId)
  }

  const [child] = await db
    .select({ conversationId: m.conversationId })
    .from(m)
    .where(and(eq(m.accountId, account.id), eq(m.inReplyTo, parsed.messageId)))
    .limit(1)
  if (child) return resolveMerged(child.conversationId)

  const c = schema.conversations
  if (gmailThreadId) {
    const [hit] = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.orgId, account.orgId), eq(c.accountId, account.id), eq(c.providerThreadId, gmailThreadId)))
      .orderBy(desc(c.lastActivityAt))
      .limit(1)
    if (hit) return resolveMerged(hit.id)
  }

  const key = normalizeSubject(parsed.subject)
  if (hasReplyPrefix(parsed.subject) && key.length >= 3 && externals.length) {
    const since = new Date(date.getTime() - THREAD_SUBJECT_WINDOW_MS)
    const overlap = or(
      ...externals.slice(0, 10).map((p) => sql`${c.participants} @> ${JSON.stringify([{ email: p.email }])}::jsonb`)
    )
    const candidates = await db
      .select({ id: c.id, subject: c.subject })
      .from(c)
      .where(
        and(
          eq(c.orgId, account.orgId),
          eq(c.accountId, account.id),
          isNull(c.mergedIntoId),
          gt(c.lastActivityAt, since),
          overlap
        )
      )
      .orderBy(desc(c.lastActivityAt))
      .limit(25)
    const hit = candidates.find((x) => normalizeSubject(x.subject) === key)
    if (hit) return hit.id
  }
  return null
}

async function storeAttachments(orgId: string, parsed: ParsedEmail) {
  const stored: { key: string; filename: string; contentType: string; size: number; contentId: string | null; isInline: boolean }[] = []
  try {
    for (const a of parsed.attachments) {
      const key = makeStorageKey(orgId, a.filename)
      await putObject(key, a.content, a.contentType)
      stored.push({ key, filename: a.filename, contentType: a.contentType, size: a.size, contentId: a.contentId, isInline: a.isInline })
    }
  } catch (err) {
    await Promise.all(stored.map((s) => deleteObject(s.key).catch(() => {})))
    throw err
  }
  return stored
}

export async function ingestRawMessage(input: IngestInput): Promise<IngestResult> {
  const { account } = input
  const mode = input.mode ?? "live"
  let parsed: ParsedEmail
  try {
    parsed = await parseRawEmail(input.source)
  } catch (err) {
    return { status: "skipped", reason: `unparsable: ${err instanceof Error ? err.message : String(err)}` }
  }

  const own = ownAddresses(account)
  const fromEmail = parsed.from?.email ?? ""
  // INBOX / Junk copies are always inbound: a forged From of our own address must not hide
  // mail (our own sent messages that also land there dedupe by Message-ID below).
  const direction: "inbound" | "outbound" =
    input.direction ??
    (input.folderRole === "sent"
      ? "outbound"
      : input.folderRole === "inbox" || input.folderRole === "junk"
        ? "inbound"
        : own.has(fromEmail)
          ? "outbound"
          : "inbound")

  // Dedupe (also matches outbound messages we sent ourselves: same Message-ID)
  const existing = await db.query.messages.findFirst({
    where: and(eq(schema.messages.accountId, account.id), eq(schema.messages.messageId, parsed.messageId)),
    columns: { id: true, conversationId: true, imapUid: true, imapMailbox: true },
  })
  if (existing) {
    if (input.uid && !existing.imapUid) {
      await db
        .update(schema.messages)
        .set({ imapMailbox: input.mailbox, imapUid: input.uid })
        .where(eq(schema.messages.id, existing.id))
    }
    return { status: "duplicate", messageDbId: existing.id, conversationId: existing.conversationId }
  }

  const date = clampDate(input.internalDate) ?? clampDate(parsed.date) ?? new Date()
  const displayDate = direction === "outbound" ? (clampDate(parsed.date) ?? date) : date
  const externals = mergeParticipants([parsed.from ? [parsed.from] : [], parsed.replyTo, parsed.to, parsed.cc], own)
  const threadId = input.gmailThreadId || null
  const foundId = await findConversation(account, parsed, externals, threadId, displayDate)

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, account.orgId),
    columns: { settings: true },
  })
  const orgSettings: OrgSettings = org?.settings ?? {}

  const stored = await storeAttachments(account.orgId, parsed)
  const hasFileAttachments = stored.some((s) => !s.isInline)
  const isJunk = input.folderRole === "junk"

  type Effects = {
    conversation: Conversation
    message: Message
    created: boolean
    reopened: boolean
    unsnoozed: boolean
    untrashed: boolean
    previousSnoozedBy: string | null
  }

  let effects: Effects
  try {
    effects = await db.transaction(async (tx: Tx): Promise<Effects> => {
      let conv: Conversation | undefined
      if (foundId) {
        ;[conv] = await tx.select().from(schema.conversations).where(eq(schema.conversations.id, foundId)).for("update")
      }
      let created = false
      if (!conv) {
        const number = await nextConversationNumber(account.orgId, tx)
        ;[conv] = await tx
          .insert(schema.conversations)
          .values({
            orgId: account.orgId,
            number,
            kind: "email",
            accountId: account.id,
            teamId: account.teamId,
            subject: parsed.subject,
            snippet: parsed.snippet,
            // Conversations we started (sent from another client) don't need attention
            status: direction === "outbound" ? "closed" : "open",
            closedAt: direction === "outbound" ? displayDate : null,
            isSpam: isJunk,
            participants: externals.slice(0, MAX_PARTICIPANTS),
            providerThreadId: threadId,
            lastActivityAt: mode === "live" ? new Date() : displayDate,
            lastMessageAt: displayDate,
            createdAt: displayDate,
          })
          .returning()
        created = true
      }
      const conversation = conv!

      const [message] = await tx
        .insert(schema.messages)
        .values({
          orgId: account.orgId,
          conversationId: conversation.id,
          accountId: account.id,
          direction,
          status: direction === "outbound" ? "sent" : "received",
          messageId: parsed.messageId,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
          fromName: parsed.from?.name ?? null,
          fromEmail: parsed.from?.email ?? "",
          to: parsed.to,
          cc: parsed.cc,
          bcc: parsed.bcc,
          replyTo: parsed.replyTo,
          subject: parsed.subject,
          textBody: parsed.text,
          htmlBody: parsed.html,
          snippet: parsed.snippet,
          headers: parsed.headers,
          hasAttachments: hasFileAttachments,
          authorId: direction === "outbound" ? account.ownerUserId : null,
          receivedAt: direction === "inbound" ? displayDate : null,
          sentAt: direction === "outbound" ? displayDate : null,
          imapMailbox: input.mailbox,
          imapUid: input.uid ?? null,
          size: parsed.size,
          createdAt: displayDate,
        })
        .onConflictDoNothing({ target: [schema.messages.accountId, schema.messages.messageId] })
        .returning()
      if (!message) throw new DuplicateMessage()

      if (stored.length) {
        await tx.insert(schema.attachments).values(
          stored.map((s) => ({
            orgId: account.orgId,
            messageId: message.id,
            filename: s.filename,
            contentType: s.contentType,
            size: s.size,
            storageKey: s.key,
            contentId: s.contentId,
            isInline: s.isInline,
          }))
        )
      }

      const set: Partial<typeof schema.conversations.$inferInsert> = {}
      if (!created) {
        const merged = mergeParticipants([conversation.participants, externals]).slice(0, MAX_PARTICIPANTS)
        if (merged.length !== conversation.participants.length) set.participants = merged
        // Prefer the original subject when an older message of the thread shows up later
        if (hasReplyPrefix(conversation.subject) && !hasReplyPrefix(parsed.subject) && stripReplyPrefixes(conversation.subject) === parsed.subject) {
          set.subject = parsed.subject
        }
        if (!conversation.providerThreadId && threadId) set.providerThreadId = threadId
      }

      let reopened = false
      let unsnoozed = false
      let untrashed = false
      if (direction === "inbound" && !created) {
        const closedBefore = conversation.closedAt && conversation.closedAt.getTime() < displayDate.getTime()
        if (conversation.status === "closed" && orgSettings.reopenOnReply !== false && (closedBefore || mode === "live")) {
          Object.assign(set, { status: "open", closedAt: null, closedBy: null })
          reopened = true
        }
        if (mode === "live" && conversation.snoozedUntil && conversation.snoozedUntil.getTime() > Date.now()) {
          Object.assign(set, { snoozedUntil: null, snoozedBy: null })
          unsnoozed = true
        }
        if (mode === "live" && conversation.isTrash && !isJunk) {
          set.isTrash = false
          untrashed = true
        }
      }
      if (Object.keys(set).length) {
        await tx.update(schema.conversations).set(set).where(eq(schema.conversations.id, conversation.id))
      }

      const events: { type: string; data: Record<string, unknown> }[] = []
      if (reopened) events.push({ type: "reopened", data: { reason: "reply", messageId: message.id } })
      if (unsnoozed) events.push({ type: "unsnoozed", data: { reason: "reply", messageId: message.id } })
      if (untrashed) events.push({ type: "restored", data: { reason: "reply", messageId: message.id } })
      if (events.length) {
        await tx.insert(schema.conversationEvents).values(
          events.map((e) => ({ orgId: account.orgId, conversationId: conversation.id, actorId: null, type: e.type, data: e.data }))
        )
      }

      await refreshConversationStats(tx, conversation.id, mode === "live" ? new Date() : displayDate)
      const [fresh] = await tx.select().from(schema.conversations).where(eq(schema.conversations.id, conversation.id))
      return {
        conversation: fresh!,
        message,
        created,
        reopened,
        unsnoozed,
        untrashed,
        previousSnoozedBy: unsnoozed ? conversation.snoozedBy : null,
      }
    })
  } catch (err) {
    await Promise.all(stored.map((s) => deleteObject(s.key).catch(() => {})))
    if (err instanceof DuplicateMessage) {
      const dup = await db.query.messages.findFirst({
        where: and(eq(schema.messages.accountId, account.id), eq(schema.messages.messageId, parsed.messageId)),
        columns: { id: true, conversationId: true },
      })
      if (dup) return { status: "duplicate", messageDbId: dup.id, conversationId: dup.conversationId }
      return { status: "skipped", reason: "duplicate" }
    }
    throw err
  }

  const { conversation, message } = effects
  const result: IngestResult = {
    status: "created",
    messageDbId: message.id,
    conversationId: conversation.id,
    conversationCreated: effects.created,
    direction,
  }

  // Address book (best effort): personal inboxes feed their owner's private contacts
  try {
    const people = direction === "inbound" ? externals : mergeParticipants([parsed.to, parsed.cc, parsed.bcc], own)
    await upsertContactsFromParticipants(account.orgId, people, { direction, at: displayDate, ownerUserId: account.ownerUserId })
  } catch (err) {
    console.error("[ingest] contact upsert failed", err)
  }

  if (mode === "backfill") return result
  await runLiveSideEffects({ account, parsed, direction, effects, orgSettings })
  return result
}

async function runLiveSideEffects(opts: {
  account: Account
  parsed: ParsedEmail
  direction: "inbound" | "outbound"
  effects: {
    conversation: Conversation
    message: Message
    created: boolean
    reopened: boolean
    unsnoozed: boolean
    previousSnoozedBy: string | null
  }
  orgSettings: OrgSettings
}) {
  const { account, parsed, direction, effects } = opts
  const { conversation, message } = effects
  const orgId = account.orgId

  // Who to tell about a reply: assignees + followers (captured before rules/assignment change them)
  let replyRecipients: string[] = []
  if (direction === "inbound" && !effects.created) {
    const [assignees, states] = await Promise.all([
      db
        .select({ userId: schema.conversationAssignees.userId })
        .from(schema.conversationAssignees)
        .where(eq(schema.conversationAssignees.conversationId, conversation.id)),
      db
        .select({
          userId: schema.conversationUserState.userId,
          following: schema.conversationUserState.following,
          muted: schema.conversationUserState.muted,
        })
        .from(schema.conversationUserState)
        .where(eq(schema.conversationUserState.conversationId, conversation.id)),
    ])
    const muted = new Set(states.filter((s) => s.muted).map((s) => s.userId))
    replyRecipients = [
      ...new Set([
        ...assignees.map((a) => a.userId),
        ...states.filter((s) => s.following).map((s) => s.userId),
        ...(effects.previousSnoozedBy ? [effects.previousSnoozedBy] : []),
      ]),
    ].filter((u) => !muted.has(u))
  }

  try {
    await runRules({
      orgId,
      trigger: direction === "inbound" ? "incoming" : "outgoing",
      conversationId: conversation.id,
      messageId: message.id,
    })
  } catch (err) {
    console.error("[ingest] rules failed", err)
  }

  // Team workload balancing for new inbound work
  if (direction === "inbound") {
    try {
      await maybeAutoAssign(orgId, conversation.id, account)
    } catch (err) {
      console.error("[ingest] auto-assignment failed", err)
    }
  }

  if (replyRecipients.length) {
    const who = parsed.from?.name || parsed.from?.email || "a customer"
    await notify({
      orgId,
      userIds: replyRecipients,
      type: "reply",
      title: `New reply from ${who}`,
      body: message.snippet || conversation.subject,
      conversationId: conversation.id,
      data: { messageId: message.id },
    }).catch((err) => console.error("[ingest] notify failed", err))
  }

  await publish({
    orgId,
    type: effects.created ? "conversation.created" : "message.created",
    conversationId: conversation.id,
    data: { messageId: message.id },
  })
  if (!effects.created) await publish({ orgId, type: "conversation.updated", conversationId: conversation.id })

  // Personal inboxes are private: never send their mail to workspace webhooks
  if (!account.ownerUserId) {
    if (effects.created) {
      await emitWebhook(orgId, "conversation.created", { conversation: conversationPayload(conversation), message: messagePayload(message) })
    }
    if (effects.reopened) {
      await emitWebhook(orgId, "conversation.reopened", { conversationId: conversation.id, number: conversation.number, reopenedBy: null, reason: "reply" })
    }
    if (direction === "inbound") {
      await emitWebhook(orgId, "message.received", { conversationId: conversation.id, message: messagePayload(message) })
    }
  }
}

/** Assign an open, unassigned conversation to a member of its team (if the team balances workload). */
async function maybeAutoAssign(orgId: string, conversationId: string, account: Account) {
  const conv = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId),
    columns: { status: true, isSpam: true, isTrash: true, teamId: true, snoozedUntil: true },
  })
  if (!conv || conv.status !== "open" || conv.isSpam || conv.isTrash) return
  const teamId = conv.teamId ?? account.teamId
  if (!teamId) return
  const team = await db.query.teams.findFirst({
    where: and(eq(schema.teams.id, teamId), eq(schema.teams.orgId, orgId)),
    columns: { assignmentStrategy: true },
  })
  if (!team || !isAssignStrategy(team.assignmentStrategy)) return
  const [assigned] = await db
    .select({ userId: schema.conversationAssignees.userId })
    .from(schema.conversationAssignees)
    .where(eq(schema.conversationAssignees.conversationId, conversationId))
    .limit(1)
  if (assigned) return
  await autoAssignToTeam({ orgId, conversationId, teamId, strategy: team.assignmentStrategy, reason: "auto" })
}
