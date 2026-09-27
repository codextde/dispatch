import { describe, expect, it, vi } from "vitest"
import { MailParseTimeoutError, parseRawEmail, withDeadline } from "../parse"

// mailparser that never settles (what 1000+ MIME parts used to do)
vi.mock("mailparser", () => ({ simpleParser: () => new Promise(() => {}) }))

describe("parse deadline (H1)", () => {
  it("rejects a parse that never settles", async () => {
    const raw = Buffer.from("From: a@evil.test\r\nTo: b@acme.test\r\nSubject: hang\r\n\r\nbody\r\n")
    const started = Date.now()
    const err = await parseRawEmail(raw, { timeoutMs: 50 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MailParseTimeoutError)
    expect(err).toMatchObject({ code: "EPARSETIMEOUT" })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it("passes results through and clears its timer", async () => {
    await expect(withDeadline(Promise.resolve(42), 50, () => new Error("late"))).resolves.toBe(42)
    await expect(withDeadline(Promise.reject(new Error("boom")), 50, () => new Error("late"))).rejects.toThrow("boom")
  })
})
