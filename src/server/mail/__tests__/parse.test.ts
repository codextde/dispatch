import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  cleanMessageId,
  extractHeaders,
  generateMessageId,
  hasReplyPrefix,
  isAutomatedMessage,
  makeSnippet,
  mergeParticipants,
  normalizeSubject,
  parseRawEmail,
  parseReferences,
  stripReplyPrefixes,
  synthesizeMessageId,
} from "../parse"

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name))

describe("message ids", () => {
  it("strips angle brackets and whitespace", () => {
    expect(cleanMessageId("<abc@example.org>")).toBe("abc@example.org")
    expect(cleanMessageId("  <abc@example.org> ")).toBe("abc@example.org")
    expect(cleanMessageId("abc@example.org")).toBe("abc@example.org")
    expect(cleanMessageId("")).toBeNull()
    expect(cleanMessageId(undefined)).toBeNull()
  })

  it("parses References headers (folded, deduped, capped)", () => {
    expect(parseReferences("<a@x> <b@x>\r\n <c@x> <a@x>")).toEqual(["a@x", "b@x", "c@x"])
    expect(parseReferences(["<a@x>", "<b@x>"])).toEqual(["a@x", "b@x"])
    expect(parseReferences("a@x b@x")).toEqual(["a@x", "b@x"])
    const many = Array.from({ length: 80 }, (_, i) => `<m${i}@x>`).join(" ")
    const parsed = parseReferences(many)
    expect(parsed).toHaveLength(50)
    expect(parsed.at(-1)).toBe("m79@x")
  })

  it("synthesizes stable ids for messages without Message-ID", () => {
    const parts = { date: new Date("2026-01-01T00:00:00Z"), from: "A@x.org", to: ["b@y.org"], subject: "Hi", body: "Hello" }
    expect(synthesizeMessageId(parts)).toBe(synthesizeMessageId({ ...parts, from: "a@x.org" }))
    expect(synthesizeMessageId(parts)).not.toBe(synthesizeMessageId({ ...parts, body: "Other" }))
    expect(synthesizeMessageId(parts)).toMatch(/^synthetic-[0-9a-f]{32}@dispatch\.invalid$/)
  })

  it("generates ids on the sender's domain", () => {
    expect(generateMessageId("Support@Acme.test")).toMatch(/^[0-9a-f-]{36}@acme\.test$/)
  })
})

describe("subjects", () => {
  it.each([
    ["Re: Hello", "Hello"],
    ["RE: Fwd: AW: WG: Hello", "Hello"],
    ["Re[2]: Hello", "Hello"],
    ["SV: Hej", "Hej"],
    ["[Ticket-12] Re: Broken", "Broken"],
    ["回复：你好", "你好"],
    ["Hello: world", "Hello: world"],
    ["Reply needed", "Reply needed"],
  ])("strips prefixes from %j", (input, expected) => {
    expect(stripReplyPrefixes(input)).toBe(expected)
  })

  it("detects reply prefixes", () => {
    expect(hasReplyPrefix("Re: x")).toBe(true)
    expect(hasReplyPrefix("Fwd: x")).toBe(true)
    expect(hasReplyPrefix("Regarding x")).toBe(false)
    expect(hasReplyPrefix("")).toBe(false)
  })

  it("normalizes for threading", () => {
    expect(normalizeSubject("RE:  Order   #1234 ")).toBe("order #1234")
    expect(normalizeSubject("AW: re: ORDER #1234")).toBe(normalizeSubject("Order #1234"))
  })
})

describe("participants and text", () => {
  it("merges participants by email and excludes own addresses", () => {
    const merged = mergeParticipants(
      [
        [{ name: null, email: "A@x.org" }],
        [
          { name: "Alice", email: "a@x.org" },
          { name: "Support", email: "support@acme.test" },
        ],
      ],
      new Set(["support@acme.test"])
    )
    expect(merged).toEqual([{ name: "Alice", email: "a@x.org" }])
  })

  it("builds snippets without quoted history", () => {
    expect(makeSnippet("Sounds good!\n\nOn Mon, 1 Jan 2026 Bob <b@x> wrote:\n> old text")).toBe("Sounds good!")
    expect(makeSnippet("Danke!\n\nAm 01.01.2026 um 10:00 schrieb Bob:\n> alt")).toBe("Danke!")
    expect(makeSnippet(null, "<p>Hello <b>there</b></p><style>p{}</style>")).toBe("Hello there")
    expect(makeSnippet("x".repeat(500))).toHaveLength(200)
  })

  it("keeps custom and list headers but drops transport noise", () => {
    const headers = extractHeaders(
      new Map<string, never>([
        ["received", "from x" as never],
        ["x-customer-tier", "gold" as never],
        ["list-unsubscribe", "<mailto:u@x>" as never],
        ["x-ms-exchange-organization", "noise" as never],
        ["subject", "Hi" as never],
      ])
    )
    expect(headers).toEqual({ "x-customer-tier": "gold", "list-unsubscribe": "<mailto:u@x>" })
  })
})

describe("loop protection", () => {
  const human = { headers: {}, fromEmail: "anna@example.org" }
  it("allows normal human mail", () => expect(isAutomatedMessage(human)).toBe(false))
  it.each([
    [{ "auto-submitted": "auto-replied" }, "anna@example.org"],
    [{ precedence: "bulk" }, "anna@example.org"],
    [{ "list-id": "<news.example.org>" }, "anna@example.org"],
    [{ "x-auto-response-suppress": "All" }, "anna@example.org"],
    [{ "x-dispatch-rule": "r1" }, "anna@example.org"],
    [{}, "no-reply@example.org"],
    [{}, "mailer-daemon@example.org"],
    [{}, "noreply+abc@example.org"],
    [{}, ""],
  ])("blocks %j from %s", (headers, fromEmail) => {
    expect(isAutomatedMessage({ headers: headers as Record<string, string>, fromEmail })).toBe(true)
  })
  it("treats Auto-Submitted: no as human", () => {
    expect(isAutomatedMessage({ headers: { "auto-submitted": "no" }, fromEmail: "a@x.org" })).toBe(false)
  })
})

describe("parseRawEmail", () => {
  it("parses a reply with threading headers, groups and quoted text", async () => {
    const m = await parseRawEmail(fixture("reply-thread.eml"))
    expect(m.messageId).toBe("reply-2@example.org")
    expect(m.hasOriginalMessageId).toBe(true)
    expect(m.inReplyTo).toBe("orig-1@acme.test")
    expect(m.references).toEqual(["thread-0@example.org", "orig-1@acme.test"])
    expect(m.subject).toBe("AW: Re: Order #1234 delayed")
    expect(m.from).toEqual({ name: "Anna Schmidt", email: "anna@example.org" })
    expect(m.to.map((p) => p.email)).toEqual(["support@acme.test", "sales@acme.test"])
    expect(m.cc.map((p) => p.email)).toEqual(["bob@example.org", "carol@example.org"])
    expect(m.replyTo).toEqual([{ name: null, email: "anna.private@example.org" }])
    expect(m.date?.toISOString()).toBe("2026-09-21T08:00:00.000Z")
    expect(m.snippet).toBe("Thanks, the new date works for us.")
    expect(m.html).toContain("<blockquote>")
    expect(m.headers["x-customer-tier"]).toBe("gold")
    expect(m.headers["list-unsubscribe"]).toContain("unsub@example.org")
    expect(m.attachments).toHaveLength(0)
  })

  it("parses attachments, inline images and encoded subjects; synthesizes a stable id", async () => {
    const raw = fixture("attachments-no-id.eml")
    const m = await parseRawEmail(raw)
    expect(m.subject).toBe("Status: Grün ✓")
    expect(m.hasOriginalMessageId).toBe(false)
    expect(m.messageId).toMatch(/^synthetic-/)
    expect((await parseRawEmail(raw)).messageId).toBe(m.messageId)
    expect(m.html).toContain('src="cid:logo@status"')
    const byName = Object.fromEntries(m.attachments.map((a) => [a.filename, a]))
    expect(byName["logo.png"]).toMatchObject({ isInline: true, contentId: "logo@status", contentType: "image/png" })
    expect(byName["report.pdf"]).toMatchObject({ isInline: false, contentId: null, contentType: "application/pdf" })
    expect(byName["report.pdf"]!.content.toString()).toBe("%PDF-1.4\n")
    // Nameless attachments get a generated filename
    expect(m.attachments.some((a) => a.filename.startsWith("attachment-"))).toBe(true)
  })

  it("strips NUL bytes and caps oversized ids (Postgres rejects them)", async () => {
    const raw = Buffer.from(
      [
        "Message-ID: <nul@example.org>",
        `In-Reply-To: <${"x".repeat(3000)}@example.org>`,
        "From: =?UTF-8?Q?Evil=00Name?= <evil@example.org>",
        "To: support@acme.test",
        "Subject: =?UTF-8?Q?Hello=00World?=",
        "X-Dispatch-Rule: forged",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Body=00with NUL",
      ].join("\r\n")
    )
    const m = await parseRawEmail(raw)
    expect(m.subject).toBe("HelloWorld")
    expect(m.text).toBe("Bodywith NUL")
    expect(m.from?.name).toBe("EvilName")
    expect(m.inReplyTo!.length).toBeLessThanOrEqual(900)
    expect(JSON.stringify(m.headers)).not.toContain("\\u0000")
    // headers only Dispatch itself may set are dropped from inbound mail
    expect(m.headers["x-dispatch-rule"]).toBeUndefined()
  })

  it("flags auto-replies", async () => {
    const m = await parseRawEmail(fixture("auto-reply.eml"))
    expect(isAutomatedMessage({ headers: m.headers, fromEmail: m.from?.email })).toBe(true)
  })
})
