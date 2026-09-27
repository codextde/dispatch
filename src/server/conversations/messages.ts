import "server-only"
import { and, desc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema, type Tx } from "@/server/db"
import { ApiError } from "@/server/api"
import { publish } from "@/server/realtime"
import { randomToken } from "@/server/crypto"
import { getSettings } from "@/server/settings"
import { nextConversationNumber } from "@/server/orgs"
import { escapeHtml } from "@/lib/inbox/templates"
import type { DraftInfo, DraftMode, MessageBody, Participant, SendResult } from "@/lib/inbox/types"
import { htmlToPlainText, makeSnippet, sanitizeComposerHtml, sanitizeEmailHtml, textToHtml } from "./sanitize"
import { atLeast, loadOneAccessible, type Ctx, type InboxScope } from "./scope"
import { DRAFT_MODE_HEADER, attachmentUrl, mergeParticipants, toDraftInfo, toThreadMessage } from "./queries"
import { addEvent, deleteUnreferencedObjects, publishConversations, upsertUserState } from "./mutations"
import { recomputeConversation } from "./stats"

const m = schema.messages
const QUOTE_MARKER = '<div class="dispatch-quote"'
const SIGNATURE_MARKER = '<div class="dispatch-signature"'
const CLOSE_HEADER = "x-dispatch-close"

const participant = z.object({ name: z.string().max(200).nullish(), email: z.string().trim().min(3).max(320) })
const strictParticipant = z.object({ name: z.string().max(200).nullish(), email: z.email() })

export const draftSchema = z.object({
  conversationId: z.uuid().nullish(),
  mode: z.enum(["reply", "reply_all", "forward", "new"]).default("reply"),
  replyToMessageId: z.uuid().nullish(),
  accountId: z.uuid().nullish(),
  fromEmail: z.string().max(320).default(""),
  to: z.array(participant).max(100).default([]),
  cc: z.array(participant).max(100).default([]),
  bcc: z.array(participant).max(100).default([]),
  subject: z.string().max(998).default(""),
  html: z.string().max(2_000_000).default(""),
  attachmentIds: z.array(z.uuid()).max(50).default([]),
  isShared: z.boolean().optional(),
  /** Expected current version when updating (optimistic concurrency) */
  version: z.number().int().min(0).optional(),
})

export const sendSchema = draftSchema.extend({
  draftId: z.uuid().nullish(),
  to: z.array(strictParticipant).max(100).default([]),
  cc: z.array(strictParticipant).max(100).default([]),
  bcc: z.array(strictParticipant).max(100).default([]),
  sendAt: z.iso.datetime({ offset: true }).nullish(),
  closeAfter: z.boolean().default(false),
})

export type DraftInput = z.infer<typeof draftSchema>
export type SendInput = z.infer<typeof sendSchema>

const normEmail = (e: string) => e.trim().toLowerCase()
const cleanList = (list: { name?: string | null; email: string }[]): Participant[] => {
  const seen = new Set<string>()
  const out: Participant[] = []
  for (const p of list) {
    const email = p.email.trim()
    if (!email || seen.has(email.toLowerCase())) continue
    seen.add(email.toLowerCase())
    out.push({ name: p.name?.trim() || null, email })
  }
  return out
}

/** Resolve and authorize the sending account + From address. */
async function resolveFrom(ctx: Ctx, scope: InboxScope, accountId: string | null | undefined, fromEmail: string) {
  if (!accountId) throw new ApiError(400, "Choose an account to send from", "missing_account")
  const level = scope.access.get(accountId)
  if (!level || !atLeast(level, "reply")) throw new ApiError(403, "You can't send from this inbox", "forbidden")
  const account = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.id, accountId), eq(schema.accounts.orgId, ctx.org.id)),
  })
  if (!account) throw new ApiError(400, "Unknown account", "invalid_account")
  const allowed = [account.email, ...account.aliases]
  const from = allowed.find((a) => normEmail(a) === normEmail(fromEmail)) ?? account.email
  const isAlias = normEmail(from) !== normEmail(account.email)
  return { account, fromEmail: from, fromName: isAlias ? account.fromName || account.name : account.fromName || account.name }
}

async function loadReplyTarget(conversationId: string, replyToMessageId: string | null | undefined) {
  if (replyToMessageId) {
    const target = await db.query.messages.findFirst({
      where: and(eq(m.id, replyToMessageId), eq(m.conversationId, conversationId), ne(m.status, "draft")),
    })
    if (!target) throw new ApiError(400, "Unknown message to reply to", "invalid_reply_target")
    return target
  }
  const [latest] = await db
    .select()
    .from(m)
    .where(and(eq(m.conversationId, conversationId), inArray(m.status, ["received", "sent", "sending"])))
    .orderBy(desc(sql`coalesce(${m.receivedAt}, ${m.sentAt}, ${m.createdAt})`))
    .limit(1)
  return latest ?? null
}

/** Link uploaded attachments to a draft/message and drop removed ones. */
async function syncMessageAttachments(tx: Tx, ctx: Ctx, messageId: string, attachmentIds: string[]) {
  const removed = await tx
    .delete(schema.attachments)
    .where(
      and(
        eq(schema.attachments.messageId, messageId),
        eq(schema.attachments.isInline, false),
        attachmentIds.length ? notInArray(schema.attachments.id, attachmentIds) : sql`true`
      )
    )
    .returning({ storageKey: schema.attachments.storageKey })
  if (attachmentIds.length) {
    await tx
      .update(schema.attachments)
      .set({ messageId })
      .where(
        and(
          eq(schema.attachments.orgId, ctx.org.id),
          inArray(schema.attachments.id, attachmentIds),
          eq(schema.attachments.uploadedBy, ctx.user.id),
          isNull(schema.attachments.messageId),
          isNull(schema.attachments.commentId)
        )
      )
  }
  const [{ count }] = (await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.messageId, messageId), eq(schema.attachments.isInline, false)))) as [{ count: number }]
  return { removedKeys: removed.map((r) => r.storageKey), count }
}

/** Copy the (non-inline) attachments of a forwarded message to the draft. */
async function copyForwardAttachments(tx: Tx, ctx: Ctx, fromMessageId: string, toMessageId: string) {
  const atts = await tx
    .select()
    .from(schema.attachments)
    .where(and(eq(schema.attachments.messageId, fromMessageId), eq(schema.attachments.isInline, false)))
  if (!atts.length) return
  await tx.insert(schema.attachments).values(
    atts.map((a) => ({
      orgId: ctx.org.id,
      messageId: toMessageId,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      storageKey: a.storageKey,
      uploadedBy: ctx.user.id,
    }))
  )
}

async function createConversationFor(tx: Tx, ctx: Ctx, accountId: string, subject: string, to: Participant[]) {
  const number = await nextConversationNumber(ctx.org.id, tx)
  const [conv] = await tx
    .insert(schema.conversations)
    .values({
      orgId: ctx.org.id,
      number,
      kind: "email",
      accountId,
      subject,
      createdBy: ctx.user.id,
      participants: to,
      messageCount: 0,
    })
    .returning()
  await upsertUserState(tx, conv!.id, ctx.user.id, { following: true, lastReadAt: new Date(), unread: false })
  return conv!
}

function subjectFor(mode: DraftMode, input: string, base: string) {
  const clean = input.trim()
  if (mode === "new") return clean
  const stripped = base.replace(/^((re|fwd?|aw|wg|sv|vs)\s*:\s*)+/i, "").trim()
  if (mode === "forward") return clean || `Fwd: ${stripped}`
  if (clean) return clean
  return stripped ? `Re: ${stripped}` : ""
}

/* ---------------------------------- Drafts --------------------------------- */

async function loadEditableDraft(ctx: Ctx, scope: InboxScope, draftId: string) {
  const draft = await db.query.messages.findFirst({ where: and(eq(m.id, draftId), eq(m.orgId, ctx.org.id), eq(m.status, "draft")) })
  if (!draft) throw new ApiError(404, "Draft not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, draft.conversationId)
  if (!row) throw new ApiError(404, "Draft not found", "not_found")
  const mine = draft.authorId === ctx.user.id
  if (!mine && !(draft.isSharedDraft && atLeast(row.level, "reply"))) throw new ApiError(403, "This draft belongs to someone else", "forbidden")
  return { draft, conversation: row.conversation, level: row.level, mine }
}

export async function getDraft(ctx: Ctx, scope: InboxScope, draftId: string): Promise<DraftInfo> {
  const { draft } = await loadEditableDraft(ctx, scope, draftId)
  const atts = await db.select().from(schema.attachments).where(eq(schema.attachments.messageId, draft.id))
  return toDraftInfo(ctx.org.slug, draft, atts)
}

/**
 * Create (no `draftId`) or update a draft. New-message drafts create their
 * own conversation (hidden from boxes until something is sent). Updates are
 * version-checked: a stale `version` yields 409 with the current draft.
 */
export async function saveDraft(ctx: Ctx, scope: InboxScope, draftId: string | null, input: DraftInput): Promise<DraftInfo> {
  const me = ctx.user.id
  const to = cleanList(input.to)
  const cc = cleanList(input.cc)
  const bcc = cleanList(input.bcc)
  const html = sanitizeComposerHtml(input.html)
  const text = htmlToPlainText(html.split(SIGNATURE_MARKER)[0] ?? "")

  if (draftId) {
    const { draft, conversation, mine } = await loadEditableDraft(ctx, scope, draftId)
    const from = input.accountId ? await resolveFrom(ctx, scope, input.accountId, input.fromEmail) : null
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(m)
        .set({
          accountId: from?.account.id ?? draft.accountId,
          fromEmail: from?.fromEmail ?? draft.fromEmail,
          fromName: from?.fromName ?? draft.fromName,
          to,
          cc,
          bcc,
          subject: input.subject,
          htmlBody: html,
          textBody: text,
          snippet: makeSnippet(text),
          isSharedDraft: mine && input.isShared !== undefined ? input.isShared : draft.isSharedDraft,
          lastEditedBy: me,
          draftVersion: sql`${m.draftVersion} + 1`,
        })
        .where(
          and(
            eq(m.id, draft.id),
            eq(m.status, "draft"),
            input.version !== undefined ? eq(m.draftVersion, input.version) : sql`true`
          )
        )
        .returning()
      if (!updated) return null
      const sync = await syncMessageAttachments(tx, ctx, updated.id, input.attachmentIds)
      await tx.update(m).set({ hasAttachments: sync.count > 0 }).where(eq(m.id, updated.id))
      if (conversation.messageCount === 0 && conversation.createdBy === me) {
        // A new-message draft: keep the conversation in sync with the draft.
        await tx
          .update(schema.conversations)
          .set({ subject: input.subject.trim(), participants: to, accountId: updated.accountId })
          .where(eq(schema.conversations.id, conversation.id))
      }
      return { updated, removedKeys: sync.removedKeys }
    })
    if (!result) {
      const current = await getDraft(ctx, scope, draft.id)
      throw new ApiError(409, "This draft was changed by someone else", "draft_conflict", current)
    }
    await deleteUnreferencedObjects(result.removedKeys)
    const info = await getDraft(ctx, scope, draft.id)
    if (info.isShared || draft.isSharedDraft) {
      await publish({
        orgId: ctx.org.id,
        type: "draft.updated",
        conversationId: conversation.id,
        actorId: me,
        data: { draftId: info.id, version: info.version },
      })
    }
    return info
  }

  // Create
  let conversationId = input.conversationId ?? null
  let accountId = input.accountId ?? null
  let replyTarget: typeof schema.messages.$inferSelect | null = null
  if (conversationId) {
    const row = await loadOneAccessible(ctx, scope, conversationId)
    if (!row || row.conversation.kind !== "email") throw new ApiError(404, "Conversation not found", "not_found")
    if (!atLeast(row.level, "reply")) throw new ApiError(403, "You can't reply in this conversation", "forbidden")
    accountId ??= row.conversation.accountId
    if (input.mode !== "new") replyTarget = await loadReplyTarget(conversationId, input.replyToMessageId)
  } else if (input.mode !== "new") {
    throw new ApiError(400, "conversationId is required for replies", "missing_conversation")
  }
  const from = await resolveFrom(ctx, scope, accountId, input.fromEmail)

  const created = await db.transaction(async (tx) => {
    if (!conversationId) conversationId = (await createConversationFor(tx, ctx, from.account.id, input.subject.trim(), to)).id
    const [draft] = await tx
      .insert(m)
      .values({
        orgId: ctx.org.id,
        conversationId,
        accountId: from.account.id,
        direction: "outbound",
        status: "draft",
        fromEmail: from.fromEmail,
        fromName: from.fromName,
        to,
        cc,
        bcc,
        subject: input.subject,
        htmlBody: html,
        textBody: text,
        snippet: makeSnippet(text),
        headers: { [DRAFT_MODE_HEADER]: input.mode },
        authorId: me,
        isSharedDraft: input.isShared ?? false,
        draftVersion: 1,
        lastEditedBy: me,
        replyToMessageId: replyTarget?.id ?? null,
      })
      .returning()
    if (input.mode === "forward" && replyTarget) await copyForwardAttachments(tx, ctx, replyTarget.id, draft!.id)
    const sync = await syncMessageAttachments(tx, ctx, draft!.id, input.attachmentIds)
    if (sync.count) await tx.update(m).set({ hasAttachments: true }).where(eq(m.id, draft!.id))
    return draft!
  })
  const info = await getDraft(ctx, scope, created.id)
  await publish({ orgId: ctx.org.id, type: "draft.updated", conversationId: created.conversationId, actorId: me, userIds: [me], data: { draftId: created.id } })
  return info
}

/** Discard a draft. Removes the conversation too if it only existed for this draft. */
export async function discardDraft(ctx: Ctx, scope: InboxScope, draftId: string) {
  const { draft, conversation } = await loadEditableDraft(ctx, scope, draftId)
  const keys = await db.transaction(async (tx) => {
    const atts = await tx.delete(schema.attachments).where(eq(schema.attachments.messageId, draft.id)).returning({ storageKey: schema.attachments.storageKey })
    await tx.delete(m).where(eq(m.id, draft.id))
    const [{ remaining }] = (await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(m)
      .where(eq(m.conversationId, conversation.id))) as [{ remaining: number }]
    if (remaining === 0 && conversation.commentCount === 0 && conversation.createdBy === ctx.user.id) {
      await tx.delete(schema.conversations).where(eq(schema.conversations.id, conversation.id))
    }
    return atts.map((a) => a.storageKey)
  })
  await deleteUnreferencedObjects(keys)
  await publish({ orgId: ctx.org.id, type: "draft.updated", conversationId: conversation.id, actorId: ctx.user.id, data: { draftId, deleted: true } })
}

/* --------------------------------- Sending --------------------------------- */

function formatDate(d: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone }).format(d)
  } catch {
    return d.toUTCString()
  }
}

function formatAddress(p: { name?: string | null; email: string }) {
  return p.name ? `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;` : escapeHtml(p.email)
}

function originalHtml(msg: typeof schema.messages.$inferSelect) {
  if (msg.htmlBody) return sanitizeEmailHtml(msg.htmlBody, { blockRemote: false }).html.replace(/<style[\s\S]*?<\/style>/gi, "")
  return textToHtml(msg.textBody ?? "")
}

function buildQuote(mode: DraftMode, msg: typeof schema.messages.$inferSelect, timeZone: string) {
  const date = formatDate(msg.receivedAt ?? msg.sentAt ?? msg.createdAt, timeZone)
  if (mode === "forward") {
    const rows = [
      `From: ${formatAddress({ name: msg.fromName, email: msg.fromEmail })}`,
      `Date: ${escapeHtml(date)}`,
      `Subject: ${escapeHtml(msg.subject)}`,
      msg.to.length ? `To: ${msg.to.map(formatAddress).join(", ")}` : "",
      msg.cc.length ? `Cc: ${msg.cc.map(formatAddress).join(", ")}` : "",
    ].filter(Boolean)
    return `${QUOTE_MARKER}><br><div>---------- Forwarded message ---------<br>${rows.join("<br>")}</div><br>${originalHtml(msg)}</div>`
  }
  return `${QUOTE_MARKER}><br><div>On ${escapeHtml(date)}, ${formatAddress({ name: msg.fromName, email: msg.fromEmail })} wrote:</div><blockquote type="cite" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${originalHtml(msg)}</blockquote></div>`
}

function messageIdFor(fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "dispatch.local"
  return `${randomToken(18)}@${domain}`
}

async function undoSeconds(ctx: Ctx) {
  const pref = (ctx.user.preferences as { undoSendSeconds?: number } | null)?.undoSendSeconds
  const org = ctx.org.settings?.undoSendSeconds
  const value = typeof pref === "number" ? pref : typeof org === "number" ? org : 5
  return Math.min(Math.max(Math.round(value), 0), 60)
}

/**
 * Queue an outbound message. It is stored with status "queued" and
 * `sendAt = now + undo window` (or "scheduled" with the requested time); the
 * worker delivers messages whose `sendAt` has passed. Until then the sender
 * can cancel it (see `cancelSend`).
 */
export async function sendMessage(ctx: Ctx, scope: InboxScope, input: SendInput): Promise<SendResult> {
  const me = ctx.user.id
  const to = cleanList(input.to)
  const cc = cleanList(input.cc)
  const bcc = cleanList(input.bcc)
  if (!to.length && !cc.length && !bcc.length) throw new ApiError(400, "Add at least one recipient", "missing_recipients")

  let draft: typeof schema.messages.$inferSelect | null = null
  let conversationId = input.conversationId ?? null
  if (input.draftId) {
    const loaded = await loadEditableDraft(ctx, scope, input.draftId)
    draft = loaded.draft
    conversationId = draft.conversationId
  }

  let conversation: typeof schema.conversations.$inferSelect | null = null
  if (conversationId) {
    const row = await loadOneAccessible(ctx, scope, conversationId)
    if (!row || row.conversation.kind !== "email") throw new ApiError(404, "Conversation not found", "not_found")
    if (!atLeast(row.level, "reply")) throw new ApiError(403, "You can't reply in this conversation", "forbidden")
    conversation = row.conversation
  } else if (input.mode !== "new") {
    throw new ApiError(400, "conversationId is required for replies", "missing_conversation")
  }

  const mode: DraftMode = input.mode
  const from = await resolveFrom(ctx, scope, input.accountId ?? draft?.accountId ?? conversation?.accountId, input.fromEmail || draft?.fromEmail || "")
  const replyTarget =
    conversation && mode !== "new" ? await loadReplyTarget(conversation.id, input.replyToMessageId ?? draft?.replyToMessageId) : null

  const userHtml = sanitizeComposerHtml(input.html)
  // The signature is part of the HTML but not of what the user "wrote" (snippet, empty check).
  const userText = htmlToPlainText(userHtml.split(SIGNATURE_MARKER)[0] ?? "")
  if (!userText && !input.attachmentIds.length && mode !== "forward") throw new ApiError(400, "Write a message first", "empty_message")

  const timeZone = ctx.user.timezone || ctx.org.settings?.timezone || "UTC"
  const fullHtml = replyTarget && mode !== "new" ? `${userHtml}${buildQuote(mode, replyTarget, timeZone)}` : userHtml
  const baseSubject = conversation ? conversation.subject : ""
  const subject = subjectFor(mode, input.subject, replyTarget?.subject || baseSubject)
  if (mode === "new" && !subject) throw new ApiError(400, "Add a subject", "missing_subject")

  const now = new Date()
  let status: "queued" | "scheduled" = "queued"
  let sendAt: Date
  if (input.sendAt) {
    sendAt = new Date(input.sendAt)
    if (sendAt.getTime() < now.getTime() + 30_000) throw new ApiError(400, "Scheduled time must be in the future", "invalid_send_at")
    status = "scheduled"
  } else {
    sendAt = new Date(now.getTime() + (await undoSeconds(ctx)) * 1000)
  }

  const references = replyTarget
    ? [...new Set([...(replyTarget.references ?? []), ...(replyTarget.messageId ? [replyTarget.messageId] : [])])].slice(-20)
    : []
  const closeAfter = input.closeAfter || Boolean(ctx.org.settings?.closeOnReply && mode !== "new")

  const values = {
    accountId: from.account.id,
    direction: "outbound" as const,
    status,
    messageId: messageIdFor(from.fromEmail),
    inReplyTo: mode === "forward" ? null : (replyTarget?.messageId ?? null),
    references: mode === "forward" ? [] : references,
    fromEmail: from.fromEmail,
    fromName: from.fromName,
    to,
    cc,
    bcc,
    subject,
    htmlBody: fullHtml,
    textBody: htmlToPlainText(fullHtml),
    snippet: makeSnippet(userText),
    headers: { [DRAFT_MODE_HEADER]: mode, ...(closeAfter ? { [CLOSE_HEADER]: "1" } : {}) },
    authorId: me,
    lastEditedBy: me,
    replyToMessageId: replyTarget?.id ?? null,
    sendAt,
    sendError: null,
    sendAttempts: 0,
  }

  const result = await db.transaction(async (tx) => {
    let convId = conversation?.id ?? null
    if (!convId) convId = (await createConversationFor(tx, ctx, from.account.id, subject, to)).id
    let message: typeof schema.messages.$inferSelect
    if (draft) {
      const [updated] = await tx
        .update(m)
        .set({ ...values, isSharedDraft: false })
        .where(and(eq(m.id, draft.id), eq(m.status, "draft")))
        .returning()
      if (!updated) throw new ApiError(409, "This draft was already sent", "already_sent")
      message = updated
    } else {
      const [inserted] = await tx
        .insert(m)
        .values({ ...values, orgId: ctx.org.id, conversationId: convId })
        .returning()
      message = inserted!
      if (mode === "forward" && replyTarget) await copyForwardAttachments(tx, ctx, replyTarget.id, message.id)
    }
    const sync = await syncMessageAttachments(tx, ctx, message.id, input.attachmentIds)
    if ((sync.count > 0) !== message.hasAttachments) {
      await tx.update(m).set({ hasAttachments: sync.count > 0 }).where(eq(m.id, message.id))
      message = { ...message, hasAttachments: sync.count > 0 }
    }

    const current = conversation ?? (await tx.query.conversations.findFirst({ where: eq(schema.conversations.id, convId) }))!
    const accountEmails = [from.account.email, ...from.account.aliases]
    await tx
      .update(schema.conversations)
      .set({
        messageCount: sql`${schema.conversations.messageCount} + 1`,
        lastMessageAt: status === "scheduled" ? current.lastMessageAt : now,
        lastOutboundAt: now,
        lastActivityAt: now,
        snippet: makeSnippet(userText),
        participants: mergeParticipants(current.participants, [...to, ...cc], accountEmails),
        hasAttachments: current.hasAttachments || message.hasAttachments,
        ...(current.messageCount === 0 ? { subject, accountId: from.account.id } : {}),
        ...(!current.firstResponseAt && current.lastInboundAt ? { firstResponseAt: now } : {}),
        ...(closeAfter && current.status === "open" ? { status: "closed" as const, closedAt: now, closedBy: me } : {}),
      })
      .where(eq(schema.conversations.id, convId))
    if (closeAfter && current.status === "open") await addEvent(tx, ctx.org.id, convId, me, "closed")
    if (status === "scheduled") await addEvent(tx, ctx.org.id, convId, me, "scheduled", { messageId: message.id, sendAt: sendAt.toISOString() })
    await upsertUserState(tx, convId, me, { lastReadAt: now, unread: false, following: true })
    const atts = await tx.select().from(schema.attachments).where(eq(schema.attachments.messageId, message.id))
    return { message, convId, atts, removedKeys: sync.removedKeys }
  })

  await deleteUnreferencedObjects(result.removedKeys)
  await publish({ orgId: ctx.org.id, type: "message.created", conversationId: result.convId, actorId: me, data: { messageId: result.message.id } })
  return {
    message: toThreadMessage(ctx.org.slug, result.message, result.atts),
    conversationId: result.convId,
    undoUntil: status === "queued" ? sendAt.toISOString() : null,
  }
}

/**
 * Undo send / cancel a scheduled message: turns it back into a draft if the
 * worker has not picked it up yet (atomic status check).
 */
export async function cancelSend(ctx: Ctx, scope: InboxScope, messageId: string): Promise<DraftInfo> {
  const msg = await db.query.messages.findFirst({ where: and(eq(m.id, messageId), eq(m.orgId, ctx.org.id)) })
  if (!msg) throw new ApiError(404, "Message not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, msg.conversationId)
  if (!row) throw new ApiError(404, "Message not found", "not_found")
  if (msg.authorId !== ctx.user.id) throw new ApiError(403, "Only the sender can cancel this message", "forbidden")

  const userHtml = (msg.htmlBody ?? "").split(QUOTE_MARKER)[0] ?? ""
  const { [CLOSE_HEADER]: closedBySend, ...headers } = msg.headers ?? {}
  const draft = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(m)
      .set({ status: "draft", sendAt: null, htmlBody: userHtml, textBody: htmlToPlainText(userHtml), headers, draftVersion: sql`${m.draftVersion} + 1` })
      .where(and(eq(m.id, messageId), inArray(m.status, ["queued", "scheduled"])))
      .returning()
    if (!updated) return null
    await recomputeConversation(msg.conversationId, tx)
    if (closedBySend && row.conversation.status === "closed" && row.conversation.closedBy === ctx.user.id) {
      await tx
        .update(schema.conversations)
        .set({ status: "open", closedAt: null, closedBy: null })
        .where(eq(schema.conversations.id, msg.conversationId))
      await addEvent(tx, ctx.org.id, msg.conversationId, ctx.user.id, "reopened")
    }
    if (msg.status === "scheduled") await addEvent(tx, ctx.org.id, msg.conversationId, ctx.user.id, "unscheduled", { messageId })
    return updated
  })
  if (!draft) throw new ApiError(409, "Too late — the message is already being sent", "already_sending")
  const atts = await db.select().from(schema.attachments).where(eq(schema.attachments.messageId, draft.id))
  await publishConversations(ctx.org.id, [msg.conversationId], ctx.user.id)
  return toDraftInfo(ctx.org.slug, draft, atts)
}

/** Send a scheduled (or queued) message right away. */
export async function sendNow(ctx: Ctx, scope: InboxScope, messageId: string) {
  const msg = await db.query.messages.findFirst({ where: and(eq(m.id, messageId), eq(m.orgId, ctx.org.id)) })
  if (!msg) throw new ApiError(404, "Message not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, msg.conversationId)
  if (!row) throw new ApiError(404, "Message not found", "not_found")
  if (msg.authorId !== ctx.user.id) throw new ApiError(403, "Only the sender can send this message", "forbidden")
  const [updated] = await db
    .update(m)
    .set({ status: "queued", sendAt: new Date() })
    .where(and(eq(m.id, messageId), inArray(m.status, ["queued", "scheduled"])))
    .returning({ id: m.id })
  if (!updated) throw new ApiError(409, "The message is already being sent", "already_sending")
  await publishConversations(ctx.org.id, [msg.conversationId], ctx.user.id)
}

/* ------------------------------ Message bodies ------------------------------ */

/** Sanitized HTML body of a message for the sandboxed iframe. */
export async function getMessageBody(ctx: Ctx, scope: InboxScope, messageId: string, loadImages: boolean): Promise<MessageBody> {
  const msg = await db.query.messages.findFirst({ where: and(eq(m.id, messageId), eq(m.orgId, ctx.org.id)) })
  if (!msg) throw new ApiError(404, "Message not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, msg.conversationId)
  if (!row) throw new ApiError(404, "Message not found", "not_found")
  if (msg.status === "draft" && msg.authorId !== ctx.user.id && !msg.isSharedDraft) throw new ApiError(404, "Message not found", "not_found")
  if (msg.status === "queued" && msg.authorId !== ctx.user.id) throw new ApiError(404, "Message not found", "not_found")

  const security = await getSettings("security")
  const allowRemote = msg.direction === "outbound" || (security.remoteImages !== "never" && (loadImages || security.remoteImages === "always"))

  if (!msg.htmlBody) {
    return { html: textToHtml(msg.textBody ?? ""), hasRemoteImages: false, imagesLoaded: true, simple: true }
  }
  const inline = await db
    .select({ id: schema.attachments.id, contentId: schema.attachments.contentId })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.messageId, msg.id), sql`${schema.attachments.contentId} is not null`))
  const cidMap = new Map(inline.map((a) => [a.contentId!.replace(/^<|>$/g, ""), `${attachmentUrl(ctx.org.slug, a.id)}?inline=1`]))
  const { html, hasRemoteImages } = sanitizeEmailHtml(msg.htmlBody, { blockRemote: !allowRemote, cidMap })
  return { html, hasRemoteImages, imagesLoaded: allowRemote, simple: msg.direction === "outbound" && msg.authorId !== null }
}

