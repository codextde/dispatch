import "server-only"
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { publish } from "@/server/realtime"
import { emitWebhook } from "@/server/jobs"
import { notify } from "@/server/notifications"
import type { ThreadComment } from "@/lib/inbox/types"
import { sanitizeCommentHtml } from "./sanitize"
import { loadOneAccessible, type Ctx, type InboxScope } from "./scope"
import { activeMemberIds, actorName, displaySubject, upsertUserState } from "./mutations"
import { toAttachmentInfo } from "./queries"

export const createCommentSchema = z.object({
  body: z.string().max(100_000),
  attachmentIds: z.array(z.uuid()).max(20).default([]),
  parentId: z.uuid().nullish(),
})

export const updateCommentSchema = z.object({ body: z.string().min(1).max(100_000) })

function plainPreview(text: string, max = 280) {
  return text.replace(/\s+/g, " ").trim().slice(0, max)
}

/** Attach previously uploaded files (mine, not yet linked) to a comment. */
async function linkCommentAttachments(ctx: Ctx, commentId: string, attachmentIds: string[]) {
  if (!attachmentIds.length) return []
  return db
    .update(schema.attachments)
    .set({ commentId })
    .where(
      and(
        eq(schema.attachments.orgId, ctx.org.id),
        inArray(schema.attachments.id, attachmentIds),
        eq(schema.attachments.uploadedBy, ctx.user.id),
        isNull(schema.attachments.messageId),
        isNull(schema.attachments.commentId)
      )
    )
    .returning()
}

export async function createComment(
  ctx: Ctx,
  scope: InboxScope,
  conversationId: string,
  input: z.infer<typeof createCommentSchema>
): Promise<ThreadComment> {
  const me = ctx.user.id
  const row = await loadOneAccessible(ctx, scope, conversationId)
  if (!row) throw new ApiError(404, "Conversation not found", "not_found")
  const conv = row.conversation
  const isChat = conv.kind === "chat"
  if (isChat && !conv.chatMemberIds.includes(me)) throw new ApiError(403, "You are not a member of this chat", "forbidden")

  const { html, mentionIds, text } = sanitizeCommentHtml(input.body)
  if (!text && !input.attachmentIds.length) throw new ApiError(400, "Comment is empty", "empty_comment")

  const members = await activeMemberIds(ctx.org.id, mentionIds)
  const mentions = mentionIds.filter((id) => members.has(id))

  if (input.parentId) {
    const parent = await db.query.comments.findFirst({
      where: and(eq(schema.comments.id, input.parentId), eq(schema.comments.conversationId, conversationId)),
      columns: { id: true },
    })
    if (!parent) throw new ApiError(400, "Unknown parent comment", "invalid_parent")
  }

  const now = new Date()
  const comment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.comments)
      .values({ orgId: ctx.org.id, conversationId, authorId: me, body: html, mentions, parentId: input.parentId ?? null })
      .returning()
    await tx
      .update(schema.conversations)
      .set({
        commentCount: sql`${schema.conversations.commentCount} + 1`,
        lastActivityAt: now,
        ...(isChat ? { snippet: plainPreview(`${ctx.user.name?.split(" ")[0] ?? ""}: ${text || "Attachment"}`, 200) } : {}),
      })
      .where(eq(schema.conversations.id, conversationId))
    // The author has seen everything; commenting follows the conversation.
    await upsertUserState(tx, conversationId, me, { lastReadAt: now, unread: false, ...(isChat ? {} : { following: true }) })
    if (!isChat) for (const uid of mentions) await upsertUserState(tx, conversationId, uid, { following: true })
    return created!
  })

  const atts = await linkCommentAttachments(ctx, comment.id, input.attachmentIds)

  const subject = displaySubject(conv)
  const preview = plainPreview(text || `${atts.length} attachment${atts.length === 1 ? "" : "s"}`)
  const mentionedOthers = mentions.filter((u) => u !== me)
  if (mentionedOthers.length) {
    await notify({
      orgId: ctx.org.id,
      userIds: mentionedOthers,
      type: "mention",
      title: isChat ? `${actorName(ctx)} mentioned you in ${subject || "a chat"}` : `${actorName(ctx)} mentioned you in “${subject}”`,
      body: preview,
      actorId: me,
      conversationId,
      commentId: comment.id,
    })
  }

  if (isChat) {
    // Direct messages notify the other member; group chats only notify on mentions.
    const others = conv.chatMemberIds.filter((u) => u !== me && !mentionedOthers.includes(u))
    if (conv.chatMemberIds.length === 2 && others.length) {
      await notify({
        orgId: ctx.org.id,
        userIds: others,
        type: "chat",
        title: `${actorName(ctx)} sent you a message`,
        body: preview,
        actorId: me,
        conversationId,
        commentId: comment.id,
      })
    }
  } else {
    const followers = await db
      .select({ userId: schema.conversationUserState.userId })
      .from(schema.conversationUserState)
      .where(
        and(
          eq(schema.conversationUserState.conversationId, conversationId),
          eq(schema.conversationUserState.following, true),
          eq(schema.conversationUserState.muted, false),
          ne(schema.conversationUserState.userId, me)
        )
      )
    const followerIds = followers.map((f) => f.userId).filter((u) => !mentionedOthers.includes(u))
    if (followerIds.length) {
      await notify({
        orgId: ctx.org.id,
        userIds: followerIds,
        type: "comment",
        title: `${actorName(ctx)} commented on “${subject}”`,
        body: preview,
        actorId: me,
        conversationId,
        commentId: comment.id,
      })
    }
    await emitWebhook(ctx.org.id, "comment.created", {
      conversationId,
      number: conv.number,
      comment: { id: comment.id, authorId: me, text, mentions, createdAt: comment.createdAt.toISOString() },
    })
  }

  await publish({
    orgId: ctx.org.id,
    type: "comment.created",
    conversationId,
    actorId: me,
    ...(isChat ? { userIds: conv.chatMemberIds } : {}),
    data: { commentId: comment.id },
  })

  return {
    id: comment.id,
    authorId: comment.authorId,
    body: comment.body,
    mentions: comment.mentions,
    parentId: comment.parentId,
    editedAt: null,
    deletedAt: null,
    createdAt: comment.createdAt.toISOString(),
    reactions: [],
    attachments: atts.map((a) => toAttachmentInfo(ctx.org.slug, a)),
  }
}

async function loadOwnComment(ctx: Ctx, scope: InboxScope, commentId: string) {
  const comment = await db.query.comments.findFirst({
    where: and(eq(schema.comments.id, commentId), eq(schema.comments.orgId, ctx.org.id), isNull(schema.comments.deletedAt)),
  })
  if (!comment) throw new ApiError(404, "Comment not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, comment.conversationId)
  if (!row) throw new ApiError(404, "Comment not found", "not_found")
  return { comment, conversation: row.conversation }
}

export async function updateComment(ctx: Ctx, scope: InboxScope, commentId: string, body: string) {
  const { comment, conversation } = await loadOwnComment(ctx, scope, commentId)
  if (comment.authorId !== ctx.user.id) throw new ApiError(403, "You can only edit your own comments", "forbidden")
  const { html, mentionIds, text } = sanitizeCommentHtml(body)
  if (!text) throw new ApiError(400, "Comment is empty", "empty_comment")
  const members = await activeMemberIds(ctx.org.id, mentionIds)
  const mentions = mentionIds.filter((id) => members.has(id))
  await db
    .update(schema.comments)
    .set({ body: html, mentions, editedAt: new Date() })
    .where(eq(schema.comments.id, commentId))
  const newlyMentioned = mentions.filter((m) => !comment.mentions.includes(m) && m !== ctx.user.id)
  if (newlyMentioned.length) {
    if (conversation.kind === "email") for (const uid of newlyMentioned) await upsertUserState(db, conversation.id, uid, { following: true })
    await notify({
      orgId: ctx.org.id,
      userIds: newlyMentioned,
      type: "mention",
      title: `${actorName(ctx)} mentioned you in “${displaySubject(conversation)}”`,
      body: plainPreview(text),
      actorId: ctx.user.id,
      conversationId: conversation.id,
      commentId,
    })
  }
  await publish({
    orgId: ctx.org.id,
    type: "comment.updated",
    conversationId: conversation.id,
    actorId: ctx.user.id,
    ...(conversation.kind === "chat" ? { userIds: conversation.chatMemberIds } : {}),
  })
  return { id: commentId, body: html, mentions }
}

export async function deleteComment(ctx: Ctx, scope: InboxScope, commentId: string) {
  const { comment, conversation } = await loadOwnComment(ctx, scope, commentId)
  if (comment.authorId !== ctx.user.id) throw new ApiError(403, "You can only delete your own comments", "forbidden")
  await db.transaction(async (tx) => {
    await tx.update(schema.comments).set({ deletedAt: new Date(), body: "" }).where(eq(schema.comments.id, commentId))
    await tx
      .update(schema.conversations)
      .set({ commentCount: sql`greatest(${schema.conversations.commentCount} - 1, 0)` })
      .where(eq(schema.conversations.id, conversation.id))
  })
  await publish({
    orgId: ctx.org.id,
    type: "comment.updated",
    conversationId: conversation.id,
    actorId: ctx.user.id,
    ...(conversation.kind === "chat" ? { userIds: conversation.chatMemberIds } : {}),
  })
}

const EMOJI_RE = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|[‍️\u{1f3fb}-\u{1f3ff}#*0-9⃣])+$/u

export const reactionSchema = z.object({
  commentId: z.uuid(),
  emoji: z.string().min(1).max(32).refine((e) => EMOJI_RE.test(e), "Invalid emoji"),
})

/** Toggle an emoji reaction of the current user on a comment. */
export async function toggleReaction(ctx: Ctx, scope: InboxScope, commentId: string, emoji: string) {
  const comment = await db.query.comments.findFirst({
    where: and(eq(schema.comments.id, commentId), eq(schema.comments.orgId, ctx.org.id), isNull(schema.comments.deletedAt)),
  })
  if (!comment) throw new ApiError(404, "Comment not found", "not_found")
  const row = await loadOneAccessible(ctx, scope, comment.conversationId)
  if (!row) throw new ApiError(404, "Comment not found", "not_found")

  const where = and(
    eq(schema.reactions.commentId, commentId),
    eq(schema.reactions.userId, ctx.user.id),
    eq(schema.reactions.emoji, emoji)
  )
  const existing = await db.select().from(schema.reactions).where(where).limit(1)
  let active: boolean
  if (existing.length) {
    await db.delete(schema.reactions).where(where)
    active = false
  } else {
    await db.insert(schema.reactions).values({ commentId, userId: ctx.user.id, emoji }).onConflictDoNothing()
    active = true
  }
  await publish({
    orgId: ctx.org.id,
    type: "comment.updated",
    conversationId: comment.conversationId,
    actorId: ctx.user.id,
    ...(row.conversation.kind === "chat" ? { userIds: row.conversation.chatMemberIds } : {}),
  })
  return { active }
}

