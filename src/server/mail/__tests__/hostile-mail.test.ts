import fs from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { countMimeParts, isBounceOrAutoReply, MAX_MIME_PARTS, parseRawEmail } from "../parse"
import { isPoisonError } from "../sync"
import { getObjectBuffer, makeStorageKey, putObject } from "@/server/storage"

// Local storage without a database (tests run without Postgres)
vi.mock("@/server/settings", () => ({
  getSettings: async () => ({ driver: "local" }),
  readSecret: () => null,
}))

const ORG = "00000000-0000-4000-8000-000000000001"

function multipart(parts: string[], opts: { boundaryHeader?: string; boundary?: string } = {}) {
  const b = opts.boundary ?? "b"
  const body: string[] = []
  for (const p of parts) body.push(`--${b}`, p)
  return Buffer.from(
    [
      "From: Attacker <attacker@evil.test>",
      "To: support@acme.test",
      "Subject: hostile",
      "Message-ID: <hostile@evil.test>",
      "MIME-Version: 1.0",
      opts.boundaryHeader ?? `Content-Type: multipart/mixed; boundary="${b}"`,
      "",
      ...body,
      `--${b}--`,
      "",
    ].join("\r\n")
  )
}

const attachment = (i: number) =>
  ["Content-Type: application/octet-stream", `Content-Disposition: attachment; filename="a${i}.bin"`, "", "x"].join("\r\n")

describe("messages with too many MIME parts (H1)", () => {
  it("counts delimiter lines and embedded messages", () => {
    expect(countMimeParts(multipart([attachment(1), attachment(2)]))).toBe(3)
    expect(countMimeParts(multipart(Array.from({ length: 1000 }, (_, i) => attachment(i))))).toBeGreaterThan(MAX_MIME_PARTS)
  })

  it("stores a placeholder instead of parsing (mailparser never settles at 1000 parts)", async () => {
    const m = await parseRawEmail(multipart(Array.from({ length: 1000 }, (_, i) => attachment(i))))
    expect(m.attachments).toHaveLength(0)
    expect(m.text).toMatch(/too many parts to import/)
    expect(m.subject).toBe("hostile")
    expect(m.from?.email).toBe("attacker@evil.test")
    expect(m.messageId).toBe("hostile@evil.test")
  }, 10_000)

  it("keeps legitimate mail with many '--' lines (diffs, signatures)", async () => {
    const text = ["Content-Type: text/plain", "", ...Array.from({ length: 800 }, (_, i) => `-- removed line ${i}`)].join("\r\n")
    const raw = multipart([text, attachment(1)])
    expect(countMimeParts(raw)).toBe(3)
    const m = await parseRawEmail(raw)
    expect(m.attachments).toHaveLength(1)
    expect(m.text).toContain("-- removed line 799")
  })

  it("reads folded boundaries and fails closed on RFC 2231 encoded ones", () => {
    const parts = Array.from({ length: 600 }, (_, i) => attachment(i))
    const folded = multipart(parts, { boundary: "abc def", boundaryHeader: "Content-Type: multipart/mixed; boundary=abc\r\n def" })
    expect(countMimeParts(folded)).toBeGreaterThan(MAX_MIME_PARTS)
    const encoded = multipart(parts, { boundary: "xyz", boundaryHeader: "Content-Type: multipart/mixed; boundary*0=x; boundary*1=yz" })
    expect(countMimeParts(encoded)).toBeGreaterThan(MAX_MIME_PARTS)
    // Invalid UTF-8 in the boundary: the parser re-encodes it, so the delimiter lines can't be matched byte for byte
    const binary = Buffer.concat([
      Buffer.from("From: a@evil.test\r\nSubject: s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\""),
      Buffer.from([0xff]),
      Buffer.from(`"\r\n\r\n${parts.map((p) => `--\u00ff\r\n${p}`).join("\r\n")}\r\n--\u00ff--\r\n`, "utf8"),
    ])
    expect(countMimeParts(binary)).toBeGreaterThan(MAX_MIME_PARTS)
  })
})

describe("attachment names that address a directory (H2)", () => {
  beforeAll(() => fs.mkdirSync(process.env.DATA_DIR!, { recursive: true }))
  afterAll(() => fs.rmSync(path.join(process.env.DATA_DIR!, "storage", "org", ORG), { recursive: true, force: true }))

  it("never keeps '.' or '..' as a file name", async () => {
    const m = await parseRawEmail(
      multipart([["Content-Type: application/pdf", 'Content-Disposition: attachment; filename=".."', "", "PWNED"].join("\r\n")])
    )
    expect(m.attachments[0]!.filename).toBe("attachment-1.pdf")
  })

  it.each(["..", ".", "...", ".hidden", "a/../..", "../../etc/passwd", ""])("builds a safe storage key for %j", (name) => {
    const key = makeStorageKey(ORG, name)
    expect(key.split("/").every((s) => s !== "" && s !== "." && s !== "..")).toBe(true)
    expect(key.split("/").pop()).not.toMatch(/^\./)
  })

  it("refuses keys with '', '.' or '..' segments instead of writing to the month directory", async () => {
    const month = makeStorageKey(ORG, "x").split("/").slice(0, 4).join("/")
    for (const key of [`${month}/rand/..`, `${month}/rand/.`, `${month}//file`, `${month}/../escape`]) {
      await expect(putObject(key, Buffer.from("PWNED"))).rejects.toMatchObject({ code: "EINVALIDKEY" })
    }
    // Legitimate keys of the same month still work
    const ok = makeStorageKey(ORG, "legit.pdf")
    await putObject(ok, Buffer.from("legit"))
    expect((await getObjectBuffer(ok))?.toString()).toBe("legit")
  })

  it("treats filesystem and parser failures of one message as poison", () => {
    for (const code of ["EISDIR", "ENOTDIR", "ENAMETOOLONG", "EINVALIDKEY", "EPARSETIMEOUT"]) {
      expect(isPoisonError(Object.assign(new Error(code), { code }))).toBe(true)
    }
    // Outages are retried, never skipped
    for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOSPC", "EINGESTTIMEOUT"]) {
      expect(isPoisonError(Object.assign(new Error(code), { code }))).toBe(false)
    }
  })
})

describe("isBounceOrAutoReply (forward loop protection, L16)", () => {
  it.each([
    [{ "auto-submitted": "auto-replied" }, "anna@example.org"],
    [{ "auto-submitted": "Auto-Replied; owner-email=x@y.z" }, "anna@example.org"],
    [{ precedence: "auto_reply" }, "anna@example.org"],
    [{ "x-autoreply": "yes" }, "anna@example.org"],
    [{ "x-failed-recipients": "gone@example.org" }, "anna@example.org"],
    [{}, "MAILER-DAEMON@mx.example.org"],
    [{}, "postmaster@example.org"],
  ])("blocks %j from %s", (headers, fromEmail) => {
    expect(isBounceOrAutoReply({ headers: headers as Record<string, string>, fromEmail })).toBe(true)
  })

  it.each([
    [{}, "anna@example.org"],
    [{ "auto-submitted": "auto-generated" }, "alerts@monitoring.example.org"],
    [{ "list-id": "<news.example.org>" }, "news@example.org"],
    [{}, "billing-noreply@vendor.example.org"],
  ])("still forwards %j from %s", (headers, fromEmail) => {
    expect(isBounceOrAutoReply({ headers: headers as Record<string, string>, fromEmail })).toBe(false)
  })
})
