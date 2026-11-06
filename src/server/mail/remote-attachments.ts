import "server-only"
import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getObjectBuffer, REMOTE_ATTACHMENT_PREFIX } from "@/server/storage"
import { recoverRemotePart } from "./remote-body"

type Attachment = Pick<typeof schema.attachments.$inferSelect, "orgId" | "size" | "storageKey">

export function remoteAttachmentKey(accountId: string, messageId: string, content: Buffer) {
  const digest = createHash("sha256").update(content).digest("hex")
  return `${REMOTE_ATTACHMENT_PREFIX}${accountId}/${Buffer.from(messageId).toString("base64url")}/${digest}`
}

export function findRemoteAttachment(
  account: typeof schema.accounts.$inferSelect,
  message: { messageId: string; imapMailbox: string | null },
  size: number,
  digest: string
) {
  return recoverRemotePart(account, message, ({ attachments }) =>
    attachments.find((file) => file.size === size && createHash("sha256").update(file.content).digest("hex") === digest)?.content ?? null
  )
}

export async function readAttachmentBuffer(attachment: Attachment): Promise<Buffer | null> {
  if (!attachment.storageKey.startsWith(REMOTE_ATTACHMENT_PREFIX)) return getObjectBuffer(attachment.storageKey)
  const [accountId, encodedId, digest] = attachment.storageKey.slice(REMOTE_ATTACHMENT_PREFIX.length).split("/")
  if (!accountId || !/^[a-f0-9-]{36}$/i.test(accountId) || !encodedId || !digest || !/^[a-f0-9]{64}$/.test(digest)) return null
  const messageId = Buffer.from(encodedId, "base64url").toString("utf8")
  const [account, original] = await Promise.all([
    db.query.accounts.findFirst({ where: and(eq(schema.accounts.orgId, attachment.orgId), eq(schema.accounts.id, accountId)) }),
    db.query.messages.findFirst({
      where: and(eq(schema.messages.orgId, attachment.orgId), eq(schema.messages.accountId, accountId), eq(schema.messages.messageId, messageId)),
      columns: { imapMailbox: true },
    }),
  ])
  if (!account) return null
  return findRemoteAttachment(account, { messageId, imapMailbox: original?.imapMailbox ?? null }, attachment.size, digest)
}
