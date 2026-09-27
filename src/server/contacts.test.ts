import { describe, expect, it } from "vitest"
import { cleanDisplayName, isSystemAddress, isValidEmail, normalizeCustomFields, normalizeEmail, normalizeTags } from "./contacts"

describe("email helpers", () => {
  it("normalizes and validates addresses", () => {
    expect(normalizeEmail("  <Jane.Doe@Example.COM> ")).toBe("jane.doe@example.com")
    expect(normalizeEmail("mailto:bob@x.io")).toBe("bob@x.io")
    expect(isValidEmail("jane@example.com")).toBe(true)
    expect(isValidEmail("jane@localhost")).toBe(false)
    expect(isValidEmail("not an email")).toBe(false)
  })

  it("detects robots and bounce addresses", () => {
    for (const e of [
      "noreply@github.com",
      "no-reply@accounts.google.com",
      "do-not-reply@shop.io",
      "mailer-daemon@googlemail.com",
      "postmaster@example.org",
      "notifications@service.io",
      "bounces+123@mail.example.com",
      "hello@bounce.newsletter.io",
    ]) {
      expect(isSystemAddress(e), e).toBe(true)
    }
    for (const e of ["hannah@brightpath.demo", "support@acme.com", "noreen@example.com"]) {
      expect(isSystemAddress(e), e).toBe(false)
    }
  })

  it("cleans display names from headers", () => {
    expect(cleanDisplayName('"Doe, Jane"', "jane@x.io")).toBe("Doe, Jane")
    expect(cleanDisplayName("jane@x.io", "jane@x.io")).toBeNull()
    expect(cleanDisplayName("  ", "jane@x.io")).toBeNull()
  })
})

describe("normalizers", () => {
  it("dedupes tags case-insensitively and slugs spaces", () => {
    expect(normalizeTags(["VIP", "vip", " new lead ", ""])).toEqual(["VIP", "new-lead"])
  })
  it("drops empty custom fields", () => {
    expect(normalizeCustomFields({ Plan: " Pro ", Empty: " ", " ": "x" })).toEqual({ Plan: "Pro" })
  })
})
