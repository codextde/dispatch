import { describe, expect, it } from "vitest"
import { isPublicEmailDomain } from "@/server/workspace/services/general"
import { microsoftSubject, verifiedEmail } from "@/server/oauth/flow"
import { MSA_CONSUMER_TENANT } from "@/server/oauth/microsoft"
import { secretsToClear } from "@/server/admin/settings"
import { safeRedirect } from "@/server/auth/magic-link"

describe("isPublicEmailDomain", () => {
  it("flags public providers, including country variants missing from the list", () => {
    for (const d of ["gmail.com", "outlook.es", "hotmail.it", "live.co.uk", "yahoo.es", "mail.de", "protonmail.ch", "outlook.com.br", "yahoo.co.jp", "@GMX.fr"]) {
      expect(isPublicEmailDomain(d), d).toBe(true)
    }
  })
  it("keeps company domains, including subdomains that start with a provider name", () => {
    for (const d of ["acme.com", "mail.acme.com", "outlook.acme.io", "northwind.co.uk", "live-events.com"]) {
      expect(isPublicEmailDomain(d), d).toBe(false)
    }
  })
})

describe("Microsoft sign-in claims", () => {
  const tid = "72f988bf-86f1-41af-91ab-2d7cd011db47"
  const oid = "00000000-0000-0000-66f3-3332eca7ea81"

  it("never trusts preferred_username and needs xms_edov for the email claim", () => {
    expect(verifiedEmail("microsoft", { tid, oid, preferred_username: "ceo@victim.com", email: "ceo@victim.com" })).toBeNull()
    expect(verifiedEmail("microsoft", { tid, oid, email: "Ann@Contoso.com", xms_edov: true })).toBe("ann@contoso.com")
    expect(verifiedEmail("microsoft", { tid, oid, email: "ann@contoso.com", xms_edov: "true" })).toBe("ann@contoso.com")
    expect(verifiedEmail("microsoft", { tid, oid, email: "ann@contoso.com", xms_edov: false })).toBeNull()
  })
  it("accepts the email of personal Microsoft accounts (verified by Microsoft)", () => {
    expect(verifiedEmail("microsoft", { tid: MSA_CONSUMER_TENANT, oid, email: "me@outlook.com" })).toBe("me@outlook.com")
  })
  it("keeps Google's email_verified rule", () => {
    expect(verifiedEmail("google", { email: "a@b.com", email_verified: true })).toBe("a@b.com")
    expect(verifiedEmail("google", { email: "a@b.com", email_verified: false })).toBeNull()
  })
  it("identifies accounts by tenant + object id only", () => {
    expect(microsoftSubject({ tid: tid.toUpperCase(), oid })).toBe(`${tid}:${oid}`)
    expect(microsoftSubject({ tid, preferred_username: "x@y.com" })).toBeNull()
    expect(microsoftSubject({ tid: "contoso.com", oid })).toBeNull()
  })
})

describe("secretsToClear", () => {
  it("drops a stored secret when its destination changes", () => {
    expect(secretsToClear("email", { provider: "smtp", host: "smtp.a.com", passwordEnc: "x" }, { provider: "smtp", host: "evil.example", passwordEnc: "x" }, {})).toEqual(["passwordEnc"])
    expect(secretsToClear("storage", { s3Endpoint: "https://s3.a.com", s3SecretEnc: "x" }, { s3Endpoint: "https://evil.example", s3SecretEnc: "x" }, {})).toEqual(["s3SecretEnc"])
    expect(secretsToClear("ai", { provider: "anthropic", baseUrl: "", apiKeyEnc: "x" }, { provider: "openai", baseUrl: "", apiKeyEnc: "x" }, {})).toEqual(["apiKeyEnc"])
    expect(secretsToClear("ai", { provider: "openai", baseUrl: "", apiKeyEnc: "x" }, { provider: "openai", baseUrl: "https://evil.example/v1", apiKeyEnc: "x" }, {})).toEqual(["apiKeyEnc"])
  })
  it("keeps it when the destination is unchanged, a new secret is entered, or none is stored", () => {
    expect(secretsToClear("email", { provider: "smtp", host: "smtp.a.com", passwordEnc: "x" }, { provider: "smtp", host: "SMTP.a.com ", port: 465, passwordEnc: "x" }, {})).toEqual([])
    expect(secretsToClear("email", { provider: "smtp", host: "smtp.a.com", passwordEnc: "x" }, { provider: "smtp", host: "smtp.b.com", passwordEnc: "x" }, { passwordEnc: "new" })).toEqual([])
    expect(secretsToClear("email", { provider: "smtp", host: "smtp.a.com", passwordEnc: "" }, { provider: "smtp", host: "smtp.b.com", passwordEnc: "" }, {})).toEqual([])
    expect(secretsToClear("general", { instanceName: "a" }, { instanceName: "b" }, {})).toEqual([])
  })
})

describe("safeRedirect (impersonation next)", () => {
  it("rejects dot-segment tricks that collapse to protocol-relative URLs", () => {
    for (const p of ["/.//evil.com", "/..//evil.com", "/%2e//evil.com", "/%2e%2e//evil.com", "/./\\evil.com"]) {
      expect(safeRedirect(p, ""), p).toBe("")
    }
    expect(safeRedirect("/w/acme/inbox", "")).toBe("/w/acme/inbox")
  })
})
