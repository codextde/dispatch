import "server-only"
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { Account, Message, Participant } from "@/server/db/schema"
import { getObjectBuffer } from "@/server/storage"
import { publish } from "@/server/realtime"
import { emitWebhook, enqueueJob } from "@/server/jobs"
import { notify } from "@/server/notifications"
import { upsertContactsFromParticipants } from "@/server/contacts"
import { runRules } from "@/server/rules/engine"
import { OAuthReauthRequiredError } from "@/server/oauth/tokens"
import { createSmtpTransport, friendlyMailError, MailConfigError } from "./connection"
import { decryptCredentials } from "./credentials"
import { BlockedHostError } from "./net-guard"
import { buildMimeMessage, type MimeAttachment } from "./mime"
import { generateMessageId, makeSnippet, mergeParticipants, normalizeEmail } from "./parse"
import { messagePayload, refreshConversationStats } from "./conversation-stats"

/**
 * Outbound delivery. The inbox queues messages (status "queued" with
 * `sendAt = now + undo window`, or "scheduled" for send-later); the worker
 * claims due messages atomically and delivers them via the account's SMTP
 * server (password or XOAUTH2).
 *
 * Retries: transient failures are retried after 1 and 5 minutes (3 attempts
 * in total); then the message is marked "failed" and the author notified.
 */

export const MAX_SEND_ATTEMPTS = 3
const RETRY_DELAYS_MS = [60_000, 5 * 60_000]
const STUCK_AFTER_MS = 15 * 60_000

/** Headers of the stored message that are passed through to the wire. */
const PASSTHROUGH_HEADERS = ["auto-submitted", "x-auto-response-suppress", "x-dispatch-rule", "x-dispatch-forwarded-message"]

/** Stores a copy in the Sent folder (IMAP APPEND) and returns its location. */
export type AppendToSent = (account: Account, raw: Buffer) => Promise<{ mailbox: string; uid: number | null } | null>

export type SendOutcome = "sent" | "retry" | "failed"

/**
 * Atomically claim due outbound messages (queued/scheduled with sendAt <= now)
 * by flipping them to "sending". Undo in the inbox works by changing the row
 * while it is still queued — a claimed message can no longer be undone.
 * Messages of paused inboxes or suspended workspaces wait until they resume.
 */
export async function claimDueMessages(limit = 10): Promise<Message[]> {
  const m = schema.messages
  const due = db
    .select({ id: m.id })
    .from(m)
    .where(
      and(
        eq(m.direction, "outbound"),
        inArray(m.status, ["queued", "scheduled"]),
        or(isNull(m.sendAt), lte(m.sendAt, sql`now()`)),
        sql`not exists (select 1 from accounts a join organizations o on o.id = a.org_id
                        where a.id = ${m.accountId} and (a.status = 'paused' or o.suspended_at is not null))`
      )
    )
    .orderBy(sql`${m.sendAt} nulls first`)
    .limit(limit)
    .for("update", { skipLocked: true })
  return db
    .update(m)
    .set({ status: "sending", sendAttempts: sql`${m.sendAttempts} + 1` })
    .where(inArray(m.id, due))
    .returning()
}

/**
 * Messages left in "sending" (worker crashed mid-delivery) are marked failed
 * rather than retried: the SMTP transaction may have completed, and a
 * duplicate email is worse than asking the author to check and resend.
 */
export async function recoverStuckSends(): Promise<number> {
  const m = schema.messages
  const rows = await db
    .update(m)
    .set({
      status: "failed",
      sendError: "Sending was interrupted. Check your Sent folder before trying again.",
    })
    .where(and(eq(m.status, "sending"), lt(m.updatedAt, new Date(Date.now() - STUCK_AFTER_MS))))
    .returning()
  for (const row of rows) await afterFailure(row)
  return rows.length
}

class PermanentSendError extends Error {}

function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentSendError || err instanceof MailConfigError || err instanceof BlockedHostError) return true
  if (err instanceof OAuthReauthRequiredError) return true
  const e = err as { code?: string; responseCode?: number }
  if (e?.code === "EENVELOPE" || e?.code === "EMESSAGE") return true
  if (e?.code === "EAUTH") return true
  if (typeof e?.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600) return true
  return false
}

function participants(list: Participant[] | null | undefined): Participant[] {
  return mergeParticipants([list ?? []])
}

async function loadAttachments(messageId: string): Promise<MimeAttachment[]> {
  const rows = await db.select().from(schema.attachments).where(eq(schema.attachments.messageId, messageId))
  const out: MimeAttachment[] = []
  for (const a of rows) {
    const content = await getObjectBuffer(a.storageKey)
    // Storage reports every read error as null: treat it as retryable (3 attempts)
    if (!content) throw new Error(`The attachment “${a.filename}” could not be read from storage.`)
    out.push({ filename: a.filename, contentType: a.contentType, content, contentId: a.contentId, isInline: a.isInline })
  }
  return out
}

function hasOAuth(account: Account) {
  return Boolean(decryptCredentials(account.credentialsEnc).oauth)
}

function smtpEndpoint(account: Account | undefined) {
  if (!account) return {}
  const creds = decryptCredentials(account.credentialsEnc)
  return { host: creds.smtp?.host, port: creds.smtp?.port, oauth: Boolean(creds.oauth) }
}

async function submit(account: Account, envelope: { from: string; to: string[] }, raw: Buffer, forceTokenRefresh: boolean) {
  const transport = await createSmtpTransport(account, { forceTokenRefresh })
  try {
    const info = await transport.sendMail({ envelope, raw })
    if (!(info.accepted ?? []).length && (info.rejected ?? []).length) {
      throw new PermanentSendError(`All recipients were rejected: ${(info.rejected as unknown[]).map(String).join(", ")}`)
    }
  } finally {
    transport.close()
  }
}

/** Compose the MIME source of a stored outbound message. */
async function composeMessage(msg: Message, account: Account, date?: Date) {
  const own = new Set([account.email, ...account.aliases].map(normalizeEmail))
  const fromEmail = own.has(normalizeEmail(msg.fromEmail)) ? normalizeEmail(msg.fromEmail) : normalizeEmail(account.email)
  const fromName = msg.fromName || account.fromName || account.name
  const to = participants(msg.to)
  const cc = participants(msg.cc)
  const bcc = participants(msg.bcc)
  const present = new Set([...to, ...cc, ...bcc].map((p) => p.email))
  for (const [list, extra] of [
    [cc, account.config.autoCc],
    [bcc, account.config.autoBcc],
  ] as const) {
    for (const email of (extra ?? []).map(normalizeEmail)) {
      if (!email || present.has(email)) continue
      list.push({ email })
      present.add(email)
    }
  }
  if (!present.size) throw new PermanentSendError("The message has no recipients.")

  const headers: Record<string, string> = { "X-Dispatch-Conversation": msg.conversationId }
  for (const h of PASSTHROUGH_HEADERS) if (msg.headers?.[h]) headers[h] = msg.headers[h]!

  const messageId = msg.messageId || generateMessageId(fromEmail)
  const mime = await buildMimeMessage({
    from: { name: fromName, email: fromEmail },
    to,
    cc,
    bcc,
    replyTo: msg.replyTo,
    subject: msg.subject,
    html: msg.htmlBody,
    text: msg.textBody,
    messageId,
    inReplyTo: msg.inReplyTo,
    references: msg.references,
    headers,
    attachments: await loadAttachments(msg.id),
    date,
  })
  return { mime, messageId }
}

/** Deliver one claimed message (status "sending"). Never throws. */
export async function deliverMessage(msg: Message): Promise<SendOutcome> {
  let account: Account | undefined
  let composed: Awaited<ReturnType<typeof composeMessage>>
  try {
    account = msg.accountId ? await db.query.accounts.findFirst({ where: eq(schema.accounts.id, msg.accountId) }) : undefined
    if (!account || account.orgId !== msg.orgId) throw new PermanentSendError("The inbox this message was sent from no longer exists.")
    composed = await composeMessage(msg, account)
    if (account.provider !== "demo") {
      try {
        await submit(account, composed.mime.envelope, composed.mime.raw, false)
      } catch (err) {
        // A rejected OAuth token may have been revoked early: refresh once and retry
        if ((err as { code?: string }).code !== "EAUTH" || !hasOAuth(account)) throw err
        await submit(account, composed.mime.envelope, composed.mime.raw, true)
      }
    }
  } catch (err) {
    return handleFailure(msg, account, err)
  }

  // Accepted by the SMTP server: from here on the message is never re-queued (no duplicates)
  const sentAt = new Date()
  let updated: Message | null = null
  for (let attempt = 1; attempt <= 3 && !updated; attempt++) {
    try {
      updated = await markSent(msg, composed.messageId, composed.mime.raw.length, sentAt)
    } catch (err) {
      console.error(`[send] message ${msg.id} was sent but could not be marked as sent (attempt ${attempt})`, err)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  if (updated) {
    try {
      await afterSuccess(account, updated)
    } catch (err) {
      console.error(`[send] post-send processing failed for ${msg.id}`, err)
    }
  }
  return "sent"
}

async function markSent(msg: Message, messageId: string, size: number, sentAt: Date): Promise<Message> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.messages)
      .set({
        status: "sent",
        sentAt,
        messageId,
        sendError: null,
        size,
        hasAttachments: sql`exists (select 1 from attachments a where a.message_id = ${msg.id} and a.is_inline = false)`,
        ...(msg.snippet ? {} : { snippet: makeSnippet(msg.textBody, msg.htmlBody) }),
      })
      .where(eq(schema.messages.id, msg.id))
      .returning()
    // System mail (rule auto-replies/forwards) must not make the conversation unread
    await refreshConversationStats(tx, msg.conversationId, msg.authorId ? sentAt : null)
    if (msg.authorId) {
      // The author has obviously seen their own message
      await tx
        .insert(schema.conversationUserState)
        .values({ conversationId: msg.conversationId, userId: msg.authorId, lastReadAt: sentAt, unread: false })
        .onConflictDoUpdate({
          target: [schema.conversationUserState.conversationId, schema.conversationUserState.userId],
          set: {
            unread: false,
            lastReadAt: sql`greatest(${schema.conversationUserState.lastReadAt}, ${sentAt.toISOString()}::timestamptz)`,
          },
        })
    }
    return row!
  })
}

async function handleFailure(msg: Message, account: Account | undefined, err: unknown): Promise<SendOutcome> {
  const message =
    err instanceof PermanentSendError ? err.message : friendlyMailError(err, { kind: "smtp", ...smtpEndpoint(account) })
  try {
    if (!isPermanent(err) && msg.sendAttempts < MAX_SEND_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[Math.min(msg.sendAttempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 60_000
      await db
        .update(schema.messages)
        .set({ status: "queued", sendAt: new Date(Date.now() + delay), sendError: message })
        .where(and(eq(schema.messages.id, msg.id), eq(schema.messages.status, "sending")))
      await publish({ orgId: msg.orgId, type: "message.updated", conversationId: msg.conversationId, data: { messageId: msg.id } })
      console.warn(`[send] message ${msg.id} attempt ${msg.sendAttempts} failed, retrying: ${message}`)
      return "retry"
    }
    const [row] = await db
      .update(schema.messages)
      .set({ status: "failed", sendError: message })
      .where(and(eq(schema.messages.id, msg.id), eq(schema.messages.status, "sending")))
      .returning()
    console.warn(`[send] message ${msg.id} failed: ${message}`)
    if (row) await afterFailure(row)
  } catch (dbErr) {
    // Left in "sending": recoverStuckSends() reports it to the author later
    console.error(`[send] could not record the failure of ${msg.id}`, dbErr)
  }
  return "failed"
}

/**
 * Job "imap.append_sent": store a copy of a sent message in the Sent folder
 * (off the delivery path, with retries). The source is re-composed with the
 * original Message-ID and date, keeping the Bcc header like mail clients do.
 */
export async function appendSentCopy(messageId: string, append: AppendToSent) {
  const msg = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) })
  if (!msg || msg.status !== "sent" || msg.imapUid || !msg.accountId) return
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, msg.accountId) })
  if (!account || account.status === "paused") return
  const { mime } = await composeMessage(msg, account, msg.sentAt ?? undefined)
  const loc = await append(account, mime.rawWithBcc)
  if (loc) {
    await db
      .update(schema.messages)
      .set({ imapMailbox: loc.mailbox, imapUid: loc.uid })
      .where(and(eq(schema.messages.id, msg.id), isNull(schema.messages.imapUid)))
  }
}

/** Gmail and Microsoft 365 store mail submitted via SMTP in Sent themselves (also with app passwords). */
function providerSavesSentMail(account: Account) {
  if (account.provider === "gmail" || account.provider === "outlook" || account.provider === "demo") return true
  const host = (decryptCredentials(account.credentialsEnc).smtp?.host ?? "").toLowerCase()
  return /(^|\.)(gmail\.com|googlemail\.com|office365\.com|outlook\.com)$/.test(host)
}

async function afterSuccess(account: Account, msg: Message) {
  if (!providerSavesSentMail(account) && account.config.saveSentCopy !== false) {
    await enqueueJob("imap.append_sent", { messageId: msg.id }, { maxAttempts: 5 })
  }

  // Personal inboxes feed their owner's private contacts, shared inboxes the shared address book
  try {
    await upsertContactsFromParticipants(msg.orgId, [...msg.to, ...msg.cc, ...msg.bcc], {
      direction: "outbound",
      at: msg.sentAt ?? new Date(),
      ownerUserId: account.ownerUserId,
    })
  } catch (err) {
    console.error("[send] contact upsert failed", err)
  }

  await publish({ orgId: msg.orgId, type: "message.updated", conversationId: msg.conversationId, data: { messageId: msg.id } })
  await publish({ orgId: msg.orgId, type: "conversation.updated", conversationId: msg.conversationId })
  // Personal inboxes are private: never send their mail to workspace webhooks
  if (!account.ownerUserId) {
    await emitWebhook(msg.orgId, "message.sent", { conversationId: msg.conversationId, message: messagePayload(msg) })
  }

  // Outgoing rules (never for rule-generated mail, to avoid loops)
  if (!msg.headers?.["x-dispatch-rule"]) {
    await runRules({ orgId: msg.orgId, trigger: "outgoing", conversationId: msg.conversationId, messageId: msg.id }).catch((err) =>
      console.error("[send] outgoing rules failed", err)
    )
  }
}

async function afterFailure(msg: Message) {
  await publish({ orgId: msg.orgId, type: "message.updated", conversationId: msg.conversationId, data: { messageId: msg.id } })
  if (!msg.authorId) return
  await notify({
    orgId: msg.orgId,
    userIds: [msg.authorId],
    type: "reply",
    title: "Message failed to send",
    body: `“${msg.subject || "(no subject)"}”: ${msg.sendError ?? "Unknown error"}`,
    conversationId: msg.conversationId,
    data: { messageId: msg.id, failed: true },
  }).catch((err) => console.error("[send] notify failed", err))
}
