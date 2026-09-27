import { describe, expect, it } from "vitest"
import { simpleParser } from "mailparser"
import { isPrivateAddress } from "../ip-ranges"
import { buildMimeMessage, extractDataUrlImages } from "../mime"
import { signWebhookPayload, verifyWebhookSignature } from "@/worker/webhook-signature"
import { createOAuthRequest, verifyOAuthCallback } from "@/server/oauth/state"

describe("isPrivateAddress (SSRF guard)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "not-an-ip",
    // IPv6 transition ranges carrying an internal IPv4 (L15)
    "::ffff:0:127.0.0.1",
    "::ffff:0:a9fe:a9fe",
    "2002:7f00:1::",
    "2002:a9fe:a9fe::1",
    "2001:0:4136:e378:8000:63bf:80ff:fffe",
    "64:ff9b:1::a9fe:a9fe",
    "3fff::1",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true))

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "142.250.185.78", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "2606:4700::6810:84e5", "2001:4860:4860::8888", "2002:808:808::1"])(
    "allows %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(false)
  )
})

describe("webhook signatures", () => {
  it("round-trips and rejects tampering / replays", () => {
    const body = JSON.stringify({ event: "message.received", data: { id: 1 } })
    const now = 1_800_000_000
    const header = signWebhookPayload("whsec_test", body, now)
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/)
    expect(verifyWebhookSignature("whsec_test", body, header, 300, now + 10)).toBe(true)
    expect(verifyWebhookSignature("whsec_other", body, header, 300, now)).toBe(false)
    expect(verifyWebhookSignature("whsec_test", body + " ", header, 300, now)).toBe(false)
    expect(verifyWebhookSignature("whsec_test", body, header, 300, now + 301)).toBe(false)
    expect(verifyWebhookSignature("whsec_test", body, "garbage", 300, now)).toBe(false)
  })
})

describe("buildMimeMessage", () => {
  it("builds threaded mail with inline images, attachments and a Bcc-only Sent copy", async () => {
    const built = await buildMimeMessage({
      from: { name: "Acme Support", email: "support@acme.test" },
      to: [{ name: "Anna", email: "anna@example.org" }],
      cc: [{ email: "bob@example.org" }],
      bcc: [{ email: "audit@acme.test" }],
      subject: "Re: Order #1234 — Grüße",
      html: '<p>Hi Anna</p><img src="cid:logo">',
      messageId: "abc@acme.test",
      inReplyTo: "<orig@example.org>",
      references: ["root@example.org", "orig@example.org"],
      headers: { "X-Dispatch-Conversation": "conv-1", "auto-submitted": "auto-replied" },
      attachments: [
        { filename: "logo.png", contentType: "image/png", content: Buffer.from("png"), contentId: "logo", isInline: true },
        { filename: "terms.pdf", contentType: "application/pdf", content: Buffer.from("%PDF") },
      ],
    })
    expect(built.envelope).toEqual({ from: "support@acme.test", to: ["anna@example.org", "bob@example.org", "audit@acme.test"] })

    const sent = await simpleParser(built.raw)
    expect(sent.messageId).toBe("<abc@acme.test>")
    expect(sent.inReplyTo).toBe("<orig@example.org>")
    expect(sent.references).toEqual(["<root@example.org>", "<orig@example.org>"])
    expect(sent.subject).toBe("Re: Order #1234 — Grüße")
    expect(sent.bcc).toBeUndefined()
    expect(sent.text).toContain("Hi Anna")
    expect(sent.headers.get("x-dispatch-conversation")).toBe("conv-1")
    expect(sent.headers.get("auto-submitted")).toBe("auto-replied")
    const inline = sent.attachments.find((a) => a.filename === "logo.png")
    expect(inline?.cid).toBe("logo")
    expect(sent.attachments.find((a) => a.filename === "terms.pdf")?.contentDisposition).toBe("attachment")

    const copy = await simpleParser(built.rawWithBcc)
    expect(copy.bcc && !Array.isArray(copy.bcc) ? copy.bcc.text : "").toBe("audit@acme.test")
  })
})

describe("extractDataUrlImages", () => {
  it("turns pasted data: images into cid attachments", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64")
    const { html, attachments } = extractDataUrlImages(`<p>Hi</p><img alt="x" src="data:image/png;base64,${png}"><img src='https://x.test/a.png'>`)
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ filename: "image-1.png", contentType: "image/png", isInline: true })
    expect(html).toContain(`src="cid:${attachments[0]!.contentId}"`)
    expect(html).toContain("https://x.test/a.png")

    const built = await buildMimeMessage({
      from: { email: "a@acme.test" },
      to: [{ email: "b@x.test" }],
      subject: "img",
      html: `<img src="data:image/png;base64,${png}">`,
      messageId: "m@acme.test",
    })
    const parsed = await simpleParser(built.raw, { keepCidLinks: true })
    expect(parsed.html).not.toContain("data:image")
    expect(parsed.html).toContain("cid:inline-")
    expect(parsed.attachments[0]?.cid).toMatch(/^inline-.+@dispatch$/)
  })
})

describe("OAuth state", () => {
  it("binds state to the browser cookie and provider", () => {
    const req = createOAuthRequest({ provider: "google", purpose: "connect", org: "acme", shared: true, teamId: null, next: null })
    const ok = verifyOAuthCallback("google", req.state, req.cookie)
    expect(ok?.payload).toMatchObject({ provider: "google", purpose: "connect", org: "acme", shared: true, nonce: req.nonce })
    expect(ok?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)

    const other = createOAuthRequest({ provider: "google", purpose: "login" })
    expect(verifyOAuthCallback("google", req.state, other.cookie)).toBeNull()
    expect(verifyOAuthCallback("microsoft", req.state, req.cookie)).toBeNull()
    expect(verifyOAuthCallback("google", req.state.replace(/.$/, "x"), req.cookie)).toBeNull()
    expect(verifyOAuthCallback("google", null, req.cookie)).toBeNull()
  })
})
