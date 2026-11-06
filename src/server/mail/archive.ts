import "server-only"
import { createHash } from "node:crypto"
import { Readable } from "node:stream"
import { and, eq, sql } from "drizzle-orm"
import { hmac } from "@/server/crypto"
import { db, schema } from "@/server/db"
import type { ImapFlow, MessageStructureObject } from "imapflow"
import { ApiError, json } from "@/server/api"
import { sanitizeEmailHtml, textToHtml } from "@/server/conversations/sanitize"
import type { Account } from "@/server/db/schema"
import { ingestRawMessage } from "./ingest"
import { cleanMessageId, parseRawEmail } from "./parse"
import { createImapClient, listMailboxes, resolveMailboxPaths } from "./connection"

const PAGE_SIZE = 40
const BODY_LIMIT = 2 * 1024 * 1024
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" }

type ArchiveQuery = { folder?: string; validity?: string; before?: number; uid?: number; part?: string }

function archiveJson(data: unknown) {
  return json(data, { headers: PRIVATE_HEADERS })
}

function mimeParts(root: MessageStructureObject): MessageStructureObject[] {
  if (root.type.toLowerCase().startsWith("multipart/") && root.disposition !== "attachment") {
    return (root.childNodes ?? []).flatMap(mimeParts)
  }
  return [{ ...root, part: root.part ?? "1" }]
}

export async function readArchive(account: Account, query: ArchiveQuery, signal: AbortSignal, findConversation: (messageId: string) => Promise<string | null>) {
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 20_000 })
  const close = () => {
    signal.removeEventListener("abort", close)
    client.close()
  }
  signal.addEventListener("abort", close, { once: true })
  let streaming = false
  try {
    signal.throwIfAborted()
    await client.connect()
    if (!query.folder) {
      const folders = await listMailboxes(client)
      const { drafts, trash } = resolveMailboxPaths(account.config, folders)
      return archiveJson({ folders, drafts, trash })
    }

    const mailbox = await client.mailboxOpen(query.folder, { readOnly: true })
    const validity = String(mailbox.uidValidity)
    if (query.validity && query.validity !== validity) {
      throw new ApiError(409, "The folder changed. Refresh the message list.", "folder_changed")
    }

    if (query.uid === undefined) {
      let end = mailbox.exists
      if (query.before !== undefined) {
        const anchor = await client.fetchOne(String(query.before), { uid: true }, { uid: true })
        if (!anchor) throw new ApiError(409, "The folder changed. Refresh the message list.", "folder_changed")
        end = anchor.seq - 1
      }
      return archiveJson(await listPage(client, end, validity))
    }

    const uid = String(query.uid)
    const message = await client.fetchOne(uid, { uid: true, bodyStructure: true, envelope: !query.part, flags: !query.part }, { uid: true })
    if (!message) throw new ApiError(404, "This message is no longer in the folder.", "not_found")
    const parts = message.bodyStructure ? mimeParts(message.bodyStructure) : []
    const bodyParts = parts.filter((part) =>
      ["text/plain", "text/html"].includes(part.type.toLowerCase()) &&
      part.disposition !== "attachment" && !part.dispositionParameters?.filename && !part.parameters?.name
    )
    const body = bodyParts.findLast((part) => part.type.toLowerCase() === "text/html") ?? bodyParts.at(-1)
    const files = parts.filter((part) => !bodyParts.includes(part))

    if (query.part) {
      const file = files.find((part) => part.part === query.part)
      if (!file) throw new ApiError(404, "Attachment not found.", "not_found")
      const download = await client.download(uid, query.part, { uid: true })
      if (!download.content) throw new ApiError(404, "Attachment not found.", "not_found")
      const filename = download.meta.filename || partName(file)
      const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
      const encoded = encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
      download.content.once("close", close)
      const response = new Response(Readable.toWeb(download.content) as ReadableStream<Uint8Array>, {
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      })
      streaming = true
      return response
    }

    let html = ""
    if (body?.part) {
      const download = await client.download(uid, body.part, { uid: true, maxBytes: BODY_LIMIT + 1 })
      if (!download.content) throw new ApiError(404, "Message content is no longer available.", "not_found")
      const chunks: Buffer[] = []
      let length = 0
      for await (const chunk of download.content) {
        const buffer = Buffer.from(chunk)
        length += buffer.length
        if (length > BODY_LIMIT) throw new ApiError(413, "This message is too large to preview.", "message_too_large")
        chunks.push(buffer)
      }
      const value = Buffer.concat(chunks).toString("utf8")
      html = body.type.toLowerCase() === "text/html" ? sanitizeEmailHtml(value, { blockRemote: true }).html : textToHtml(value)
    }
    const messageId = cleanMessageId(message.envelope?.messageId)
    const conversationId = messageId ? await findConversation(messageId) : null
    return archiveJson({ html, conversationId, isDraft: message.flags?.has("\\Draft") ?? false, files: files.map((part) => ({ part: part.part, name: partName(part) })) })
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(502, "The mail server could not complete the request. Try again.", "imap_unavailable")
  } finally {
    if (!streaming) close()
  }
}

const IMPORT_LIMIT = 25 * 1024 * 1024

async function fetchArchiveSource(account: Account, input: { folder: string; validity: string; uid: number }, draft: boolean) {
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 20_000 })
  try {
    await client.connect()
    const paths = resolveMailboxPaths(account.config, await listMailboxes(client))
    const mailbox = await client.mailboxOpen(input.folder, { readOnly: true })
    if (String(mailbox.uidValidity) !== input.validity) {
      throw new ApiError(409, "The folder changed. Refresh the message list.", "folder_changed")
    }
    const uid = String(input.uid)
    const metadata = await client.fetchOne(uid, { size: true, flags: true, internalDate: true, ...(client.capabilities.has("X-GM-EXT-1") ? { threadId: true } : {}) }, { uid: true })
    if (!metadata) throw new ApiError(404, "This message is no longer in the folder.", "not_found")
    const isDraft = mailbox.path === paths.drafts || Boolean(metadata.flags?.has("\\Draft"))
    if (isDraft !== draft) {
      throw new ApiError(400, draft ? "This message is not a draft." : "Drafts cannot be imported as conversations.", "invalid_folder")
    }
    if (!metadata.size || metadata.size > IMPORT_LIMIT) {
      throw new ApiError(413, "This message is too large to import.", "message_too_large")
    }
    const message = await client.fetchOne(uid, { source: { start: 0, maxLength: IMPORT_LIMIT + 1 } }, { uid: true })
    if (!message || !message.source) throw new ApiError(404, "Message content is no longer available.", "not_found")
    if (message.source.length > IMPORT_LIMIT) throw new ApiError(413, "This message is too large to import.", "message_too_large")

    const folderRole = mailbox.path === paths.sent ? "sent"
      : mailbox.path === paths.junk ? "junk"
        : mailbox.path === paths.inbox ? "inbox" : "other"
    return { source: message.source, mailbox: mailbox.path, folderRole, metadata } as const
  } finally {
    client.close()
  }
}

type ArchiveTarget = { folder: string; validity: string; uid: number }

export async function importArchiveMessage(account: Account, input: ArchiveTarget) {
  const { source, mailbox, folderRole, metadata } = await fetchArchiveSource(account, input, false)
  const result = await ingestRawMessage({
    account,
    source,
    mailbox,
    uid: input.uid,
    folderRole,
    internalDate: metadata.internalDate ? new Date(metadata.internalDate) : null,
    flags: metadata.flags,
    gmailThreadId: metadata.threadId,
    mode: "backfill",
  })
  if (result.status === "skipped") throw new ApiError(422, "This message could not be imported.", "import_failed")
  return result
}

export async function readArchiveDraft(account: Account, input: ArchiveTarget) {
  const { source } = await fetchArchiveSource(account, input, true)
  return { mail: await parseRawEmail(source), origin: createHash("sha256").update(source).digest("hex") }
}

type DraftLink = { id: string; version: number }
type DraftLocation = { accountId: string; version: number; folder: string; validity: string; uid: number; digest: string; conflict?: boolean }

export async function appendArchiveDraft(account: Account, source: Buffer, copyId: string, link?: DraftLink) {
  if (source.length > IMPORT_LIMIT) throw new ApiError(413, "This draft is too large to copy.", "message_too_large")
  await db.transaction(async (tx) => {
    const key = `imap-draft-copy:${link?.id ?? copyId}`
    const [lock] = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired
    `)
    if (!lock?.acquired) throw new ApiError(409, "This draft is already being copied.", "draft_copy_pending")

    const m = schema.messages
    const match = link && and(eq(m.id, link.id), eq(m.orgId, account.orgId), eq(m.accountId, account.id), eq(m.status, "draft"))
    const draft = match && await tx.query.messages.findFirst({ where: match, columns: { headers: true, draftVersion: true } })
    if (link && (!draft || draft.draftVersion !== link.version)) {
      throw new ApiError(409, "The draft changed before it could be copied.", "draft_conflict")
    }
    const prior = draft ? draftLocation(draft.headers["x-dispatch-imap-draft"]) : null
    if (prior?.accountId === account.id && link && prior.version >= link.version) return

    const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 20_000 })
    const deadline = setTimeout(() => client.close(), 35_000)
    deadline.unref()
    try {
      await client.connect()
      const { drafts } = resolveMailboxPaths(account.config, await listMailboxes(client))
      if (!drafts) throw new ApiError(409, "The mail server did not identify a Drafts folder.", "invalid_folder")
      const mailbox = await client.mailboxOpen(drafts)
      const validity = String(mailbox.uidValidity)
      let uid: number | undefined
      let digest = sourceDigest(source)
      if (mailbox.exists) {
        const matches = await client.search({ header: { "Message-ID": `<${copyId}>` } }, { uid: true })
        if (!Array.isArray(matches) || matches.length > 25) {
          throw new ApiError(502, "The mail server could not check for an existing copy.", "imap_unavailable")
        }
        if (matches.length) {
          const copies = await client.fetchAll(matches.join(","), { uid: true, envelope: true }, { uid: true })
          const existing = copies.find((message) => cleanMessageId(message.envelope?.messageId) === copyId)
          if (existing && !link) return
          if (existing) {
            uid = existing.uid
            // An existing revision could have been edited remotely. Never
            // use its current content as the proof for a later deletion.
            digest = ""
          }
        }
      }
      if (uid === undefined) {
        const appended = await client.append(drafts, source, ["\\Draft", "\\Seen"])
        if (!appended) throw new ApiError(502, "The mail server could not confirm the draft copy.", "imap_unavailable")
        uid = appended.uidValidity === mailbox.uidValidity ? appended.uid : undefined
      }
      if (!link || !match) return
      let obsoleteUid: number | undefined
      if (uid && prior && prior.uid && uid !== prior.uid && prior.accountId === account.id &&
          prior.folder === drafts && prior.validity === validity && prior.digest && client.capabilities.has("UIDPLUS")) {
        const old = await client.fetchOne(String(prior.uid), { source: { start: 0, maxLength: IMPORT_LIMIT + 1 }, flags: true }, { uid: true })
        if (old && old.flags?.has("\\Draft") && old.source && sourceDigest(old.source) === prior.digest) obsoleteUid = prior.uid
      }
      const location: DraftLocation = {
        accountId: account.id, version: link.version, folder: drafts, validity, uid: uid ?? 0, digest,
        conflict: Boolean(prior?.conflict || (prior?.accountId === account.id && !obsoleteUid)),
      }
      const [linked] = await tx.update(m)
        .set({ headers: sql`${m.headers} || jsonb_build_object('x-dispatch-imap-draft', ${JSON.stringify(location)}::text)` })
        .where(match)
        .returning({ id: m.id })

      if (linked && obsoleteUid) await client.messageDelete(String(obsoleteUid), { uid: true })
    } finally {
      clearTimeout(deadline)
      client.close()
    }
  })
}

function sourceDigest(source: Buffer) {
  return createHash("sha256").update(source).digest("hex")
}

export function draftLocation(value: string | undefined): DraftLocation | null {
  if (!value) return null
  try {
    return JSON.parse(value) as DraftLocation
  } catch {
    return null
  }
}

export function linkedDraftMessageId(accountId: string, draftId: string, version: number) {
  return `${hmac(`${accountId}:${draftId}:${version}`, "imap-draft-copy")}@dispatch.invalid`
}

export async function findLinkedDraftEdit(account: Account, draftId: string, location: DraftLocation) {
  if (location.accountId !== account.id || !location.digest) return null
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 15_000 })
  const deadline = setTimeout(() => client.close(), 25_000)
  deadline.unref()
  try {
    await client.connect()
    const { drafts } = resolveMailboxPaths(account.config, await listMailboxes(client))
    if (!drafts || drafts !== location.folder) return null
    const mailbox = await client.mailboxOpen(drafts, { readOnly: true })
    if (!mailbox.exists) return null
    const copyId = linkedDraftMessageId(account.id, draftId, location.version)
    const matches = await client.search({ header: { "Message-ID": `<${copyId}>` } }, { uid: true })
    if (!Array.isArray(matches)) throw new ApiError(502, "Could not check the remote draft.", "imap_unavailable")
    if (!matches.length || matches.length > 10) return null
    const metadata = await client.fetchAll(matches.join(","), { uid: true, envelope: true, size: true, flags: true }, { uid: true })
    const edited = metadata.filter((candidate) => cleanMessageId(candidate.envelope?.messageId) === copyId &&
      candidate.flags?.has("\\Draft") && !candidate.flags.has("\\Deleted") && candidate.size && candidate.size <= IMPORT_LIMIT &&
      !(location.validity === String(mailbox.uidValidity) && candidate.uid === location.uid))
    if (edited.length !== 1) return null
    const uid = edited[0]!.uid
    const raw = await client.fetchOne(String(uid), { source: { start: 0, maxLength: IMPORT_LIMIT + 1 } }, { uid: true })
    if (!raw || !raw.source || raw.source.length > IMPORT_LIMIT) return null
    const origin = sourceDigest(raw.source)
    if (origin === location.digest) return null
    return { mail: await parseRawEmail(raw.source), origin, uid, validity: String(mailbox.uidValidity) }
  } finally {
    clearTimeout(deadline)
    client.close()
  }
}

/** Remove only a revision previously verified and written by Dispatch. */
export async function removeLinkedArchiveDraft(account: Account, location: DraftLocation) {
  if (location.accountId !== account.id || !Number.isInteger(location.uid) || location.uid < 1 ||
      !/^[0-9]+$/.test(location.validity) || !/^[a-f0-9]{64}$/.test(location.digest)) return
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 20_000 })
  const deadline = setTimeout(() => client.close(), 35_000)
  deadline.unref()
  try {
    await client.connect()
    if (!client.capabilities.has("UIDPLUS")) return
    const { drafts } = resolveMailboxPaths(account.config, await listMailboxes(client))
    if (drafts !== location.folder) return
    const mailbox = await client.mailboxOpen(drafts)
    if (String(mailbox.uidValidity) !== location.validity) return
    const uid = String(location.uid)
    const old = await client.fetchOne(uid, {
      source: { start: 0, maxLength: IMPORT_LIMIT + 1 },
      flags: true,
    }, { uid: true })
    if (!old || !old.flags?.has("\\Draft") || !old.source || sourceDigest(old.source) !== location.digest) return
    if (!(await client.messageDelete(uid, { uid: true }))) throw new Error("The mail server did not confirm draft cleanup.")
  } finally {
    clearTimeout(deadline)
    client.close()
  }
}

export type ArchiveAction =
  | { action: "seen"; seen: boolean }
  | { action: "move"; destination: string }
  | { action: "trash" }

export async function updateArchiveMessage(
  account: Account,
  input: ArchiveAction & { folder: string; validity: string; uid: number },
  canTrash: boolean
) {
  const client = await createImapClient(account, { disableAutoIdle: true, socketTimeout: 20_000 })
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen(input.folder)
    if (String(mailbox.uidValidity) !== input.validity) {
      throw new ApiError(409, "The folder changed. Refresh the message list.", "folder_changed")
    }
    const uid = String(input.uid)
    const current = await client.fetchOne(uid, { uid: true, envelope: true }, { uid: true })
    if (!current) {
      throw new ApiError(404, "This message is no longer in the folder.", "not_found")
    }

    const messageId = cleanMessageId(current.envelope?.messageId)
    const source = mailbox.path
    if (input.action === "seen") {
      const flags = ["\\Seen"]
      const updated = input.seen
        ? await client.messageFlagsAdd(uid, flags, { uid: true })
        : await client.messageFlagsRemove(uid, flags, { uid: true })
      if (!updated) throw new ApiError(502, "The mail server did not update the message.", "imap_unavailable")
      return { seen: input.seen, messageId, source }
    }

    const folders = await listMailboxes(client)
    const trash = resolveMailboxPaths(account.config, folders).trash
    const destination = input.action === "trash" ? trash : input.destination
    if (!destination || !folders.some((folder) => folder.path === destination)) {
      throw new ApiError(400, "The destination folder is unavailable.", "invalid_destination")
    }
    if (!canTrash && (destination === trash || folders.some((folder) => folder.path === destination && folder.specialUse === "\\Trash"))) {
      throw new ApiError(403, "You don't have permission to move messages to the trash.", "forbidden")
    }
    if (destination === mailbox.path) {
      throw new ApiError(400, "Choose a different folder.", "invalid_destination")
    }
    // Avoid the library's COPY + EXPUNGE fallback on servers without MOVE.
    const rev2 = client.enabled.has("IMAP4REV2") ||
      (client.capabilities.has("IMAP4rev2") && !client.capabilities.has("IMAP4rev1"))
    if (!client.capabilities.has("MOVE") && !rev2) {
      throw new ApiError(501, "The mail server does not support safe message moves.", "imap_move_unsupported")
    }
    const moved = await client.messageMove(uid, destination, { uid: true })
    if (!moved) throw new ApiError(502, "The mail server could not confirm the move. Refresh the folder before trying again.", "imap_unavailable")
    return {
      destination,
      messageId,
      source,
      destinationUid: moved.uidMap?.get(input.uid) ?? null,
      destinationValidity: moved.uidValidity ? String(moved.uidValidity) : null,
      trashState: destination === trash ? true : source === trash ? false : undefined,
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(502, "The mail server could not confirm the change. Refresh the folder before trying again.", "imap_unavailable")
  } finally {
    client.close()
  }
}

function partName(part: MessageStructureObject) {
  return part.dispositionParameters?.filename || part.parameters?.name || `attachment-${part.part}`
}

async function listPage(client: ImapFlow, end: number, validity: string) {
  const start = Math.max(end - PAGE_SIZE + 1, 1)
  const messages = end > 0
    ? await client.fetchAll(`${start}:${end}`, { uid: true, envelope: true, internalDate: true, flags: true })
    : []
  const items = messages.sort((a, b) => b.seq - a.seq).map((message) => ({
    uid: message.uid,
    subject: message.envelope?.subject ?? "",
    from: message.envelope?.from?.map((entry) => entry.name || entry.address).filter(Boolean).join(", ") ?? "",
    to: message.envelope?.to?.map((entry) => entry.name || entry.address).filter(Boolean).join(", ") ?? "",
    date: message.envelope?.date ?? message.internalDate ?? null,
    seen: message.flags?.has("\\Seen") ?? false,
  }))
  return { validity, items, before: start > 1 ? items.at(-1)?.uid ?? null : null }
}
