import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm"
import { z } from "zod"
import { ApiError, json, parseJson, parseQuery, route } from "@/server/api"
import { audit } from "@/server/audit"
import { compactMessageAttachments, compactMessageHtml, importRemoteDraft } from "@/server/conversations/messages"
import { markRead } from "@/server/conversations/mutations"
import { inboxContext } from "@/server/conversations/context"
import { atLeast, loadOneAccessible, visibleWhere, type Ctx, type InboxScope } from "@/server/conversations/scope"
import { db, schema } from "@/server/db"
import { importArchiveMessage, readArchive, readArchiveDraft, updateArchiveMessage } from "@/server/mail/archive"
import { REMOTE_ATTACHMENT_PREFIX } from "@/server/storage"
import { publish } from "@/server/realtime"
import { rateLimit } from "@/server/rate-limit"

const uid = z.coerce.number().int().min(1).max(4294967295)
const folder = z.string().min(1).max(1024).regex(/^[^\x00-\x1f\x7f]+$/)
const validity = z.string().regex(/^\d{1,20}$/)
const query = z.object({
  account: z.string().uuid(),
  folder: folder.optional(),
  validity: validity.optional(),
  uid: uid.optional(),
  before: uid.optional(),
  part: z.string().max(64).regex(/^\d+(\.\d+)*$/).optional(),
}).refine((value) =>
  (!(value.uid || value.before) || Boolean(value.folder && value.validity)) &&
  (!value.part || Boolean(value.uid)) && !(value.uid && value.before)
)

export const GET = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug)
  const input = parseQuery(req, query)
  const account = await getAccount(ctx, scope, input.account)
  return readArchive(account, input, req.signal, async (messageId) => {
    const m = schema.messages
    const c = schema.conversations
    const [match] = await db.select({ id: c.id }).from(m)
      .innerJoin(c, eq(c.id, m.conversationId))
      .where(and(eq(m.orgId, ctx.org.id), eq(m.accountId, account.id), eq(m.messageId, messageId),
        inArray(m.status, ["received", "sent"]), visibleWhere(ctx, scope)))
      .limit(1)
    return match?.id ?? null
  })
})

async function getAccount(ctx: Ctx, scope: InboxScope, id: string) {
  if (!scope.access.has(id)) throw new ApiError(404, "Inbox not found", "not_found")
  const account = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.id, id), eq(schema.accounts.orgId, ctx.org.id)),
  })
  if (!account || account.provider === "demo") throw new ApiError(404, "Inbox not found", "not_found")
  const limit = await rateLimit(`mail-archive:${ctx.org.id}:${ctx.user.id}`, 90, 60)
  if (!limit.ok) throw new ApiError(429, "Too many requests. Try again shortly.", "rate_limited")
  return account
}

const target = { account: z.string().uuid(), folder, validity, uid }
const mutation = z.discriminatedUnion("action", [
  z.object({ ...target, action: z.literal("seen"), seen: z.boolean() }),
  z.object({ ...target, action: z.literal("move"), destination: folder }),
  z.object({ ...target, action: z.literal("trash") }),
])

export const PATCH = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, mutation)
  const account = await getAccount(ctx, scope, input.account)
  const level = scope.access.get(account.id)
  if (!level || !atLeast(level, "reply")) throw new ApiError(403, "This mailbox is read only.", "forbidden")
  const canTrash = ctx.permissions.has("conversations.delete")
  if (input.action === "trash" && !canTrash) throw new ApiError(403, "You don't have permission to trash messages.", "forbidden")
  const result = await updateArchiveMessage(account, input, canTrash)
  try {
    const m = schema.messages
    const c = schema.conversations
    if (result.messageId && "seen" in result && result.seen !== undefined) {
      const seen = result.seen
      const [match] = await db.select({ id: c.id }).from(m)
        .innerJoin(c, eq(c.id, m.conversationId))
        .where(and(eq(m.orgId, ctx.org.id), eq(m.accountId, account.id), eq(m.messageId, result.messageId),
          inArray(m.status, ["received", "sent"]), seen ? eq(c.messageCount, 1) : undefined, visibleWhere(ctx, scope)))
        .limit(1)
      if (match) {
        await db.transaction((tx) => markRead(ctx.org.id, ctx.user.id, [match.id], seen, tx))
        await publish({ orgId: ctx.org.id, type: "conversation.updated", conversationId: match.id, userIds: [ctx.user.id] })
      }
    }
    if (result.messageId && result.destination) {
      const state = schema.mailboxSyncState
      const [destinationState] = result.destinationValidity ? await db.select({ validity: state.uidValidity })
        .from(state).where(and(eq(state.accountId, account.id), eq(state.mailbox, result.destination))).limit(1) : []
      const destinationUid = destinationState && String(destinationState.validity) === result.destinationValidity
        ? result.destinationUid : null
      const destination = result.destination
      const messageId = result.messageId
      const trashState = result.trashState
      const updated = await db.transaction(async (tx) => {
        const [message] = await tx.update(m)
          .set({ imapMailbox: destination, imapUid: destinationUid })
          .where(and(eq(m.orgId, ctx.org.id), eq(m.accountId, account.id), eq(m.messageId, messageId),
            eq(m.imapMailbox, result.source), eq(m.imapUid, input.uid), inArray(m.status, ["received", "sent"])))
          .returning({ conversationId: m.conversationId })
        if (message && trashState !== undefined) {
          await tx.update(c).set({ isTrash: trashState })
            .where(and(eq(c.orgId, ctx.org.id), eq(c.accountId, account.id), eq(c.id, message.conversationId), eq(c.messageCount, 1)))
        }
        return message
      })
      if (updated) await publish({ orgId: ctx.org.id, type: "conversation.updated", conversationId: updated.conversationId })
    }
  } catch (error) {
    // The IMAP operation has already succeeded. Don't suggest retrying it after a local failure.
    console.error("[mail-archive] failed to reconcile an IMAP change", error)
  }
  if (result.destination) {
    await audit({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: input.action === "trash" ? "mail.trashed" : "mail.moved",
      targetType: "account",
      targetId: account.id,
      metadata: { folder: input.folder, uid: input.uid, validity: input.validity, destination: result.destination },
    })
  }
  return new Response(null, { status: 204 })
})

export const POST = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, z.object({ ...target, asDraft: z.boolean().optional() }))
  const account = await getAccount(ctx, scope, input.account)
  const level = scope.access.get(account.id)
  if (!level || !atLeast(level, "reply") || !ctx.permissions.has("conversations.reply")) {
    throw new ApiError(403, "You don't have permission to import into this mailbox.", "forbidden")
  }
  const limit = await rateLimit(`mail-archive-import:${ctx.org.id}:${ctx.user.id}`, 8, 60)
  if (!limit.ok) throw new ApiError(429, "Too many imports. Try again shortly.", "rate_limited")
  if (input.asDraft) {
    const { mail: remote, origin } = await readArchiveDraft(account, input)
    const saved = await importRemoteDraft(ctx, scope, account.id, remote, origin)
    return json({ draftId: saved.id }, { headers: { "Cache-Control": "private, no-store" } })
  }
  const result = await importArchiveMessage(account, input)
  if (result.status === "created") {
    await publish({
      orgId: ctx.org.id,
      type: result.conversationCreated ? "conversation.created" : "conversation.updated",
      conversationId: result.conversationId,
      data: { accountId: account.id },
    })
    await audit({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: "mail.imported",
      targetType: "conversation",
      targetId: result.conversationId,
      metadata: { accountId: account.id, folder: input.folder, uid: input.uid, validity: input.validity },
    })
  }
  if (!(await loadOneAccessible(ctx, scope, result.conversationId))) {
    throw new ApiError(404, "Conversation not found", "not_found")
  }
  return json({ conversationId: result.conversationId }, { headers: { "Cache-Control": "private, no-store" } })
})

export const PUT = route<{ slug: string }>(async (req, { params }) => {
  const { ctx, scope } = await inboxContext(req, (await params).slug, { write: true })
  const input = await parseJson(req, z.object({ account: z.uuid(), after: z.uuid().nullable() }))
  if (scope.access.get(input.account) !== "manage") {
    throw new ApiError(403, "You can't manage this mailbox.", "forbidden")
  }
  const account = await getAccount(ctx, scope, input.account)
  const m = schema.messages
  const c = schema.conversations
  const hasHtml = sql<boolean>`(${m.htmlBody} is not null and nullif(btrim(${m.textBody}), '') is not null)`
  const hasAttachments = sql<boolean>`exists (
    select 1 from attachments a where a.org_id = ${ctx.org.id}
      and a.message_id = "messages"."id" and a.storage_key not like ${`${REMOTE_ATTACHMENT_PREFIX}%`}
  )`
  const [message] = await db.select({ id: m.id, hasHtml, hasAttachments }).from(m)
    .innerJoin(c, eq(c.id, m.conversationId))
    .where(and(eq(m.orgId, ctx.org.id), eq(m.accountId, account.id), eq(m.status, "received"),
      isNotNull(m.imapMailbox), isNotNull(m.messageId), visibleWhere(ctx, scope),
      input.after ? gt(m.id, input.after) : undefined, or(hasHtml, hasAttachments)))
    .orderBy(m.id)
    .limit(1)
  if (!message) return json({ next: null, verified: 0, skipped: 0 })

  let verified = 0
  let skipped = 0
  const operations = [
    ...(message.hasHtml ? [compactMessageHtml] : []),
    ...(message.hasAttachments ? [compactMessageAttachments] : []),
  ]
  for (const compact of operations) {
    try {
      await compact(ctx, scope, message.id)
      verified++
    } catch (err) {
      if (!(err instanceof ApiError) || err.status === 403) throw err
      skipped++
    }
  }
  return json({ next: message.id, verified, skipped })
})
