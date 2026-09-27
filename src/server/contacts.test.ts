import { describe, expect, it } from "vitest"
import {
  cleanDisplayName,
  isSystemAddress,
  isValidEmail,
  legacyOtherEmails,
  mergedAlternateEmails,
  normalizeAlternateEmails,
  normalizeCustomFields,
  normalizeEmail,
  normalizeTags,
  planContactUpsert,
  type UpsertCandidate,
} from "./contacts"

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

describe("alternate emails", () => {
  it("normalizes, dedupes and drops the primary address", () => {
    expect(normalizeAlternateEmails([" Jane@Work.io ", "jane@work.io", "jane@home.io", "JANE@main.io", "nope"], "jane@main.io")).toEqual({
      emails: ["jane@work.io", "jane@home.io"],
      invalid: ["nope"],
    })
    expect(normalizeAlternateEmails(Array.from({ length: 30 }, (_, i) => `a${i}@x.io`), "p@x.io").emails).toHaveLength(20)
  })

  it("reads the legacy 'Other emails' custom field", () => {
    expect(legacyOtherEmails({ "Other emails": "A@x.io, b@y.io; junk" })).toEqual(["a@x.io", "b@y.io"])
    expect(legacyOtherEmails({})).toEqual([])
  })

  it("moves merged-away addresses and their alternates onto the target", () => {
    const target = { email: "jane@main.io", alternateEmails: ["jane@old.io"], customFields: { "Other emails": "jane@legacy.io" } }
    const sources = [
      { email: "Jane@Work.io", alternateEmails: ["j@work.io", "jane@main.io"], customFields: {} },
      { email: "jane@old.io", alternateEmails: [], customFields: {} },
    ]
    expect(mergedAlternateEmails(target, sources)).toEqual(["jane@old.io", "jane@legacy.io", "jane@work.io", "j@work.io"])
  })
})

describe("planContactUpsert", () => {
  const shared = (id: string, email: string, alternateEmails: string[] = []): UpsertCandidate => ({ id, email, alternateEmails, ownerUserId: null })
  const mine = (id: string, email: string, alternateEmails: string[] = []): UpsertCandidate => ({ id, email, alternateEmails, ownerUserId: "u1" })

  it("maps alternate addresses onto their contact instead of creating new ones", () => {
    const plan = planContactUpsert(["a@x.io", "alt@x.io", "alt2@x.io", "new@x.io"], [shared("c1", "a@x.io"), shared("c2", "b@x.io", ["alt@x.io", "alt2@x.io"])], null)
    expect(plan).toEqual({ insert: ["a@x.io", "new@x.io"], bump: ["c2"], skipped: [] })
  })

  it("prefers a primary match over an alternate one", () => {
    const plan = planContactUpsert(["dup@x.io"], [shared("c1", "x@x.io", ["dup@x.io"]), shared("c2", "dup@x.io")], null)
    expect(plan.insert).toEqual(["dup@x.io"])
    expect(plan.bump).toEqual([])
  })

  it("owner mode skips everything the shared book knows and only bumps the owner's contacts", () => {
    const candidates = [shared("s1", "known@x.io", ["known-alt@x.io"]), mine("p1", "mine@x.io", ["mine-alt@x.io"]), { ...mine("p2", "other@x.io", ["theirs@x.io"]), ownerUserId: "u2" }]
    const plan = planContactUpsert(["known@x.io", "known-alt@x.io", "mine-alt@x.io", "theirs@x.io", "fresh@x.io"], candidates, "u1")
    expect(plan).toEqual({ insert: ["theirs@x.io", "fresh@x.io"], bump: ["p1"], skipped: ["known@x.io", "known-alt@x.io"] })
  })

  it("shared mode ignores private contacts", () => {
    const plan = planContactUpsert(["mine-alt@x.io"], [mine("p1", "mine@x.io", ["mine-alt@x.io"])], null)
    expect(plan).toEqual({ insert: ["mine-alt@x.io"], bump: [], skipped: [] })
  })
})
