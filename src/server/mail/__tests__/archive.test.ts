import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Account } from "@/server/db/schema"
import { appendArchiveDraft, findLinkedDraftEdit, linkedDraftMessageId, importArchiveMessage, removeLinkedArchiveDraft, updateArchiveMessage } from "../archive"

const { client, getDraftRow } = vi.hoisted(() => ({
  getDraftRow: vi.fn(),
  client: {
    connect: vi.fn(),
    close: vi.fn(),
    mailboxOpen: vi.fn(),
    fetchOne: vi.fn(),
    fetchAll: vi.fn(),
    search: vi.fn(),
    append: vi.fn(),
    messageMove: vi.fn(),
    messageDelete: vi.fn(),
    capabilities: new Map(),
    enabled: new Set<string>(),
  },
}))

vi.mock("../connection", () => ({
  createImapClient: async () => client,
  listMailboxes: async () => [{ path: "Trash", specialUse: "\\Trash" }, { path: "Archive" }],
  resolveMailboxPaths: () => ({ trash: "Trash", drafts: "Drafts" }),
}))

vi.mock("@/server/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/db")>()
  return {
    ...original,
    db: {
      ...original.db,
      transaction: async (callback: (tx: unknown) => unknown) => callback({
        execute: async () => [{ acquired: true }],
        query: { messages: { findFirst: getDraftRow } },
        update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "draft" }] }) }) }),
      }),
    },
  }
})

const account = { config: {} } as Account
const target = { folder: "INBOX", uid: 7, validity: "10" }

describe("IMAP archive moves", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.capabilities.clear()
    client.enabled.clear()
    client.mailboxOpen.mockResolvedValue({ uidValidity: BigInt(10), path: "INBOX" })
    client.fetchOne.mockResolvedValue({ uid: 7 })
    client.messageMove.mockResolvedValue({ destination: "Archive" })
  })

  it("rejects an old folder identity before using the UID", async () => {
    await expect(updateArchiveMessage(account, { ...target, validity: "9", action: "trash" }, true))
      .rejects.toMatchObject({ status: 409 })
    expect(client.fetchOne).not.toHaveBeenCalled()
    expect(client.close).toHaveBeenCalled()
  })

  it("applies trash permissions even if the caller supplies the trash as a destination", async () => {
    await expect(updateArchiveMessage(account, { ...target, action: "move", destination: "Trash" }, false))
      .rejects.toMatchObject({ status: 403 })
    expect(client.messageMove).not.toHaveBeenCalled()
  })

  it("does not invoke COPY and EXPUNGE fallback if MOVE is unavailable", async () => {
    client.capabilities.set("IMAP4rev1", true)
    client.capabilities.set("IMAP4rev2", true)
    await expect(updateArchiveMessage(account, { ...target, action: "move", destination: "Archive" }, true))
      .rejects.toMatchObject({ status: 501 })
    expect(client.messageMove).not.toHaveBeenCalled()
  })

  it("moves only the requested UID when MOVE is supported", async () => {
    client.capabilities.set("MOVE", true)
    client.fetchOne.mockResolvedValue({ uid: 7, envelope: { messageId: "<mail@example.test>" } })
    client.messageMove.mockResolvedValue({ destination: "Archive", uidValidity: BigInt(30), uidMap: new Map([[7, 19]]) })
    await expect(updateArchiveMessage(account, { ...target, action: "move", destination: "Archive" }, true))
      .resolves.toMatchObject({
        destination: "Archive",
        source: "INBOX",
        messageId: "mail@example.test",
        destinationUid: 19,
        destinationValidity: "30",
      })
    expect(client.messageMove).toHaveBeenCalledWith("7", "Archive", { uid: true })
  })
})

describe("IMAP archive import", () => {
  it("rejects a remote draft before downloading its content", async () => {
    client.fetchOne.mockReset()
    client.mailboxOpen.mockResolvedValue({ uidValidity: BigInt(10), path: "INBOX" })
    client.fetchOne.mockResolvedValue({ size: 100, flags: new Set(["\\Draft"]) })

    await expect(importArchiveMessage(account, target)).rejects.toMatchObject({ status: 400 })
    expect(client.fetchOne).toHaveBeenCalledTimes(1)
  })
})

describe("IMAP draft export retries", () => {
  it("reuses an exact existing copy of the same revision", async () => {
    const copyId = "draft-version@dispatch.invalid"
    client.append.mockClear()
    client.mailboxOpen.mockResolvedValue({ exists: 1 })
    client.search.mockResolvedValue([123])
    client.fetchAll.mockResolvedValue([{ envelope: { messageId: `<${copyId}>` } }])
    await appendArchiveDraft(account, Buffer.from("draft"), copyId)
    expect(client.append).not.toHaveBeenCalled()
  })

  it("does not treat an IMAP substring hit as an exact copy", async () => {
    const copyId = "draft-version@dispatch.invalid"
    client.mailboxOpen.mockResolvedValue({ exists: 1 })
    client.search.mockResolvedValue([123])
    client.fetchAll.mockResolvedValue([{ envelope: { messageId: "<another-draft@dispatch.invalid>" } }])
    client.append.mockResolvedValue({ uid: 124 })
    const source = Buffer.from("draft")
    await appendArchiveDraft(account, source, copyId)
    expect(client.append).toHaveBeenCalledWith("Drafts", source, ["\\Draft", "\\Seen"])
  })
})

describe("linked draft revisions", () => {
  it.each([false, true])("deletes only the exact prior draft after APPEND (remote edited: %s)", async (edited) => {
    const prior = Buffer.from("old content")
    const linkedAccount = { id: "account", orgId: "org", config: {} } as Account
    client.capabilities.set("UIDPLUS", true)
    client.messageDelete.mockClear()
    client.mailboxOpen.mockResolvedValue({ exists: 1, uidValidity: BigInt(4) })
    client.search.mockResolvedValue([])
    client.append.mockResolvedValue({ uid: 9, uidValidity: BigInt(4) })
    client.fetchOne.mockResolvedValue({ source: edited ? Buffer.from("Aruba edit") : prior, flags: new Set(["\\Draft"]) })
    getDraftRow.mockResolvedValue({
      draftVersion: 2,
      headers: { "x-dispatch-imap-draft": JSON.stringify({
        accountId: linkedAccount.id, version: 1, folder: "Drafts", validity: "4", uid: 8,
        digest: createHash("sha256").update(prior).digest("hex"),
      }) },
    })

    await appendArchiveDraft(linkedAccount, Buffer.from("new content"), "revision@dispatch.invalid", { id: "draft", version: 2 })

    if (edited) expect(client.messageDelete).not.toHaveBeenCalled()
    else expect(client.messageDelete).toHaveBeenCalledWith("8", { uid: true })
  })
})

describe("linked draft cleanup", () => {
  it.each([false, true])("preserves a different revision after send or discard (edited: %s)", async (edited) => {
    const original = Buffer.from("saved revision")
    const linked = { id: "account", config: {} } as Account
    client.capabilities.set("UIDPLUS", true)
    client.messageDelete.mockReset().mockResolvedValue(true)
    client.mailboxOpen.mockResolvedValue({ uidValidity: BigInt(30) })
    client.fetchOne.mockResolvedValue({ source: edited ? Buffer.from("remote edit") : original, flags: new Set(["\\Draft"]) })
    await removeLinkedArchiveDraft(linked, {
      accountId: linked.id, version: 1, folder: "Drafts", validity: "30", uid: 7,
      digest: createHash("sha256").update(original).digest("hex"),
    })
    if (edited) expect(client.messageDelete).not.toHaveBeenCalled()
    else expect(client.messageDelete).toHaveBeenCalledWith("7", { uid: true })
  })
})

it("reads an Aruba replacement only when it retains the linked draft identity", async () => {
  const linked = { id: "account", config: {} } as Account
  const id = linkedDraftMessageId(linked.id, "draft", 2)
  const flags = new Set(["\\Draft"])
  const location = { accountId: linked.id, version: 2, folder: "Drafts", validity: "30", uid: 7, digest: "old" }
  client.mailboxOpen.mockResolvedValue({ exists: 2, uidValidity: BigInt(30) })
  client.search.mockResolvedValue([7, 8, 9])
  client.fetchAll.mockResolvedValue([
    { uid: 7, envelope: { messageId: id }, size: 100, flags },
    { uid: 8, envelope: { messageId: id }, size: 100, flags },
    { uid: 9, envelope: { messageId: "different@example.test" }, size: 100, flags },
  ])
  client.fetchOne.mockClear().mockResolvedValue({ source: Buffer.from(`Message-ID: <${id}>\r\nSubject: Edited remotely\r\n\r\nNew text`) })
  await expect(findLinkedDraftEdit(linked, "draft", location)).resolves.toMatchObject({ uid: 8, mail: { subject: "Edited remotely" } })
  expect(client.fetchOne).toHaveBeenCalledTimes(1)
})
