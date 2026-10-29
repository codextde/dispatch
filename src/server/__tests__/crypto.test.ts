import { describe, expect, it } from "vitest"
import { decrypt, decryptJson, encrypt, encryptJson, hashPassword, hashToken, hmac, maskSecret, randomCode, randomToken, safeEqual, sign, unsign, verifyPassword } from "@/server/crypto"

describe("crypto", () => {
  it("round-trips encryption with random IVs", () => {
    const a = encrypt("imap-password")
    const b = encrypt("imap-password")
    expect(a).not.toEqual(b)
    expect(a.startsWith("v1:")).toBe(true)
    expect(decrypt(a)).toBe("imap-password")
    expect(decryptJson<{ x: number }>(encryptJson({ x: 1 }))).toEqual({ x: 1 })
  })

  it("rejects tampered ciphertext", () => {
    const enc = encrypt("secret")
    const parts = enc.split(":")
    parts[3] = Buffer.from("tampered").toString("base64url")
    expect(() => decrypt(parts.join(":"))).toThrow()
    expect(decryptJson("garbage")).toBeNull()
  })

  it("signs and verifies values", () => {
    const signed = sign("state-123", "oauth")
    expect(unsign(signed, "oauth")).toBe("state-123")
    expect(unsign(signed, "other-purpose")).toBeNull()
    expect(unsign(signed.slice(0, -2) + "xx", "oauth")).toBeNull()
  })

  it("generates tokens, codes and hashes", () => {
    expect(randomToken(32)).toHaveLength(43)
    expect(randomCode(6)).toMatch(/^\d{6}$/)
    expect(hashToken("abc")).toHaveLength(64)
    expect(hmac("a", "p1")).not.toEqual(hmac("a", "p2"))
    expect(safeEqual("abc", "abc")).toBe(true)
    expect(safeEqual("abc", "abd")).toBe(false)
    expect(safeEqual("abc", "abcd")).toBe(false)
  })

  it("masks secrets for display", () => {
    expect(maskSecret("sk_live_1234567890abcd")).toBe("sk_live_••••abcd")
    expect(maskSecret("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe("sk-ant-api03-••••wxyz")
    expect(maskSecret("")).toBe("")
    expect(maskSecret("short")).toBe("••••••••")
    // passwords never reveal most of their characters
    expect(maskSecret("Sup3rS3cretPass")).toBe("••••••••")
    expect(maskSecret("a-long-smtp-password-123")).toBe("••••-123")
  })

  it("hashes passwords with a unique salt and verifies them", () => {
    const a = hashPassword("correct horse battery staple")
    const b = hashPassword("correct horse battery staple")
    expect(a).not.toEqual(b)
    expect(verifyPassword("correct horse battery staple", a)).toBe(true)
    expect(verifyPassword("wrong password", a)).toBe(false)
    expect(verifyPassword("correct horse battery staple", "invalid")).toBe(false)
  })
})
