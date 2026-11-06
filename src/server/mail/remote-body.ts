import "server-only"
import { createHash } from "node:crypto"
import type { Account, Message } from "@/server/db/schema"
import { createImapClient, listMailboxes } from "./connection"
import { cleanMessageId, parseRawEmail, type ParsedEmail } from "./parse"

export const REMOTE_HTML = "x-dispatch-remote-html"
const MAX_SOURCE = 25 * 1024 * 1024

export function htmlDigest(html: string) {
  return createHash("sha256").update(html).digest("hex")
}

/** Match both Message-ID and the body digest before returning any remote HTML. */
export async function recoverRemoteHtml(
  account: Account,
  message: Pick<Message, "messageId" | "imapMailbox" | "imapUid">,
  digest: string
): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(digest)) return null
  return recoverRemotePart(account, message, (parsed) =>
    parsed.html && htmlDigest(parsed.html) === digest ? parsed.html : null
  )
}

export async function recoverRemotePart<T>(
  account: Account,
  message: Pick<Message, "messageId" | "imapMailbox">,
  match: (parsed: ParsedEmail) => T | null
): Promise<T | null> {
  if (!message.messageId) return null
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 15_000 })
  const deadline = setTimeout(() => client.close(), 25_000)
  deadline.unref()
  try {
    await client.connect()
    const listed = await listMailboxes(client)
    const paths = listed.filter((item) => item.specialUse !== "\\Drafts").map((item) => item.path)
    const folders = message.imapMailbox && paths.includes(message.imapMailbox)
      ? [message.imapMailbox, ...paths.filter((path) => path !== message.imapMailbox)]
      : paths
    for (const path of folders) {
      const mailbox = await client.mailboxOpen(path, { readOnly: true })
      if (!mailbox.exists) continue
      const candidates = await client.search({ header: { "Message-ID": `<${message.messageId}>` } }, { uid: true })
      if (!Array.isArray(candidates) || !candidates.length || candidates.length > 10) continue
      const metadata = await client.fetchAll(candidates.join(","), { uid: true, envelope: true, size: true, flags: true }, { uid: true })
      for (const candidate of metadata) {
        if (cleanMessageId(candidate.envelope?.messageId) !== message.messageId ||
            candidate.flags?.has("\\Draft") || !candidate.size || candidate.size > MAX_SOURCE) continue
        const result = await client.fetchOne(String(candidate.uid), { source: { start: 0, maxLength: MAX_SOURCE + 1 } }, { uid: true })
        if (!result || !result.source || result.source.length > MAX_SOURCE) continue
        const parsed = await parseRawEmail(result.source)
        if (parsed.messageId !== message.messageId) continue
        const content = match(parsed)
        if (content !== null) return content
      }
    }
    return null
  } finally {
    clearTimeout(deadline)
    client.close()
  }
}
