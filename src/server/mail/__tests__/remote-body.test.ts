import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Account } from "@/server/db/schema"
import { htmlDigest, recoverRemoteHtml } from "../remote-body"

const { client } = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    close: vi.fn(),
    mailboxOpen: vi.fn(),
    search: vi.fn(),
    fetchAll: vi.fn(),
    fetchOne: vi.fn(),
  },
}))

vi.mock("../connection", () => ({
  createImapClient: async () => client,
  listMailboxes: async () => [{ path: "INBOX" }, { path: "Clients" }],
}))

const message = { messageId: "one@example.test", imapMailbox: "INBOX", imapUid: 4 }
const source = Buffer.from([
  "From: sender@example.test",
  "To: receiver@example.test",
  "Message-ID: <one@example.test>",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Original</p>",
].join("\r\n"))

describe("remote HTML recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.mailboxOpen.mockImplementation(async (path: string) => ({ exists: path === "INBOX" ? 0 : 1 }))
    client.search.mockResolvedValue([10])
    client.fetchAll.mockResolvedValue([{ uid: 10, envelope: { messageId: "<one@example.test>" }, size: source.length }])
    client.fetchOne.mockResolvedValue({ source })
  })

  it("recovers matching HTML after a move to a different folder", async () => {
    await expect(recoverRemoteHtml({} as Account, message, htmlDigest("<p>Original</p>")))
      .resolves.toBe("<p>Original</p>")
    expect(client.mailboxOpen).toHaveBeenCalledWith("Clients", { readOnly: true })
    expect(client.close).toHaveBeenCalled()
  })

  it("rejects different content with the same Message-ID", async () => {
    await expect(recoverRemoteHtml({} as Account, message, htmlDigest("<p>Different</p>"))).resolves.toBeNull()
  })
})
