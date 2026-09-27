import "server-only"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { getSettings } from "@/server/settings"
import { makeStorageKey, putObject } from "@/server/storage"
import type { UploadResult } from "@/lib/inbox/types"
import { loadOneAccessible, type Ctx, type InboxScope } from "./scope"
import { toAttachmentInfo } from "./queries"

/** Raster images and PDFs may be shown inline (`?inline=1`); everything else downloads. */
export const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "application/pdf",
])

export function safeContentType(value: string | null | undefined) {
  const v = (value || "").toLowerCase().split(";")[0]!.trim()
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(v) ? v : "application/octet-stream"
}

export function safeFilename(name: string | null | undefined) {
  const cleaned = (name || "file")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(-200)
  return cleaned || "file"
}

/** Store an uploaded file for a later draft/message/comment (unlinked until then). */
export async function storeUpload(ctx: Ctx, file: File): Promise<UploadResult> {
  const storage = await getSettings("storage")
  const max = storage.maxAttachmentMb * 1024 * 1024
  if (file.size === 0) throw new ApiError(400, "The file is empty", "empty_file")
  if (file.size > max) throw new ApiError(413, `Files can be at most ${storage.maxAttachmentMb} MB`, "file_too_large")
  const filename = safeFilename(file.name)
  const contentType = safeContentType(file.type)
  const key = makeStorageKey(ctx.org.id, filename)
  await putObject(key, Buffer.from(await file.arrayBuffer()), contentType)
  const [row] = await db
    .insert(schema.attachments)
    .values({ orgId: ctx.org.id, filename, contentType, size: file.size, storageKey: key, uploadedBy: ctx.user.id })
    .returning()
  return toAttachmentInfo(ctx.org.slug, row!)
}

/** Authorize access to an attachment through its message/comment conversation. */
export async function getAuthorizedAttachment(ctx: Ctx, scope: InboxScope, id: string) {
  const att = await db.query.attachments.findFirst({
    where: and(eq(schema.attachments.id, id), eq(schema.attachments.orgId, ctx.org.id)),
  })
  if (!att) throw new ApiError(404, "Attachment not found", "not_found")
  const notFound = () => new ApiError(404, "Attachment not found", "not_found")

  if (att.messageId) {
    const msg = await db.query.messages.findFirst({
      where: eq(schema.messages.id, att.messageId),
      columns: { conversationId: true, status: true, authorId: true, isSharedDraft: true },
    })
    if (!msg) throw notFound()
    if (msg.status === "draft" && msg.authorId !== ctx.user.id && !msg.isSharedDraft) throw notFound()
    // Like its body: a message still in its sender's undo window isn't shown to anyone else yet.
    if (msg.status === "queued" && msg.authorId !== ctx.user.id) throw notFound()
    if (!(await loadOneAccessible(ctx, scope, msg.conversationId))) throw notFound()
    return att
  }
  if (att.commentId) {
    const comment = await db.query.comments.findFirst({
      where: eq(schema.comments.id, att.commentId),
      columns: { conversationId: true, deletedAt: true },
    })
    if (!comment || comment.deletedAt) throw notFound()
    if (!(await loadOneAccessible(ctx, scope, comment.conversationId))) throw notFound()
    return att
  }
  if (att.uploadedBy !== ctx.user.id) throw notFound()
  return att
}
