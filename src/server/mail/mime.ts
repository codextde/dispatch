import crypto from "node:crypto"
import MailComposer from "nodemailer/lib/mail-composer"
import type { Participant } from "@/server/db/schema"
import { htmlToMailText } from "./parse"

/**
 * Build the RFC 5322 source of an outbound message. Pure (no I/O): the
 * caller loads attachment contents. The same bytes are submitted via SMTP
 * and appended to the Sent folder, so both copies are identical.
 */

export type MimeAttachment = {
  filename: string
  contentType: string
  content: Buffer
  contentId?: string | null
  isInline?: boolean
}

export type MimeInput = {
  from: Participant
  to: Participant[]
  cc?: Participant[]
  bcc?: Participant[]
  replyTo?: Participant[]
  subject: string
  html?: string | null
  text?: string | null
  /** Without angle brackets */
  messageId: string
  inReplyTo?: string | null
  references?: string[]
  headers?: Record<string, string>
  attachments?: MimeAttachment[]
  date?: Date
}

export type BuiltMime = {
  /** Submitted via SMTP (no Bcc header) */
  raw: Buffer
  /** Stored in the Sent folder (keeps the Bcc header like mail clients do) */
  rawWithBcc: Buffer
  envelope: { from: string; to: string[] }
}

const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Images pasted into the editor arrive as data: URLs, which Gmail and Outlook
 * block. Turn them into inline attachments referenced by cid:.
 */
export function extractDataUrlImages(html: string): { html: string; attachments: MimeAttachment[] } {
  const attachments: MimeAttachment[] = []
  const out = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)\2/gi,
    (match: string, prefix: string, quote: string, type: string, data: string) => {
      const content = Buffer.from(data.replace(/\s+/g, ""), "base64")
      if (!content.length || content.length > MAX_INLINE_IMAGE_BYTES) return match
      const contentType = type.toLowerCase()
      const ext = (contentType.split("/")[1] ?? "png").replace("jpeg", "jpg").replace("svg+xml", "svg").replace(/[^a-z0-9]/g, "")
      const contentId = `inline-${crypto.randomUUID()}@dispatch`
      attachments.push({ filename: `image-${attachments.length + 1}.${ext}`, contentType, content, contentId, isInline: true })
      return `${prefix}${quote}cid:${contentId}${quote}`
    }
  )
  return { html: out, attachments }
}

const addr = (p: Participant) => (p.name ? { name: p.name, address: p.email } : p.email)
const bracket = (id: string) => `<${id.replace(/^<|>$/g, "")}>`

export async function buildMimeMessage(input: MimeInput): Promise<BuiltMime> {
  const extracted = input.html?.trim() ? extractDataUrlImages(input.html) : null
  const html = extracted?.html ?? null
  const text = input.text?.trim() ? input.text : html ? htmlToMailText(html) : ""
  const attachments = [...(input.attachments ?? []), ...(extracted?.attachments ?? [])]
  const options: ConstructorParameters<typeof MailComposer>[0] = {
    from: addr(input.from),
    to: input.to.map(addr),
    cc: (input.cc ?? []).map(addr),
    bcc: (input.bcc ?? []).map(addr),
    replyTo: input.replyTo?.length ? input.replyTo.map(addr) : undefined,
    subject: input.subject,
    messageId: bracket(input.messageId),
    inReplyTo: input.inReplyTo ? bracket(input.inReplyTo) : undefined,
    references: input.references?.length ? input.references.map(bracket).join(" ") : undefined,
    date: input.date ?? new Date(),
    text,
    html: html ?? undefined,
    headers: input.headers,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      ...(a.isInline && a.contentId ? { cid: a.contentId.replace(/^<|>$/g, ""), contentDisposition: "inline" as const } : {}),
    })),
    disableFileAccess: true,
    disableUrlAccess: true,
  }
  const build = (keepBcc: boolean) => {
    const node = new MailComposer(options).compile()
    node.keepBcc = keepBcc
    return new Promise<Buffer>((resolve, reject) => node.build((err, buf) => (err ? reject(err) : resolve(buf))))
  }
  const recipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])].map((p) => p.email.toLowerCase())
  return {
    raw: await build(false),
    rawWithBcc: await build(true),
    envelope: { from: input.from.email, to: [...new Set(recipients)] },
  }
}
