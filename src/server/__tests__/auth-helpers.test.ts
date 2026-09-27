import { describe, expect, it } from "vitest"
import { emailSchema, safeRedirect } from "@/server/auth/magic-link"
import { slugify, RESERVED_SLUGS } from "@/server/orgs"
import { ALL_PERMISSIONS, SYSTEM_ROLES, hasPermission } from "@/lib/permissions"

describe("safeRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirect("/w/acme/inbox")).toBe("/w/acme/inbox")
    expect(safeRedirect("/invite/abc?x=1")).toBe("/invite/abc?x=1")
  })
  it("blocks open redirects", () => {
    expect(safeRedirect("https://evil.com", "/")).toBe("/")
    expect(safeRedirect("//evil.com", "/")).toBe("/")
    expect(safeRedirect("/\\evil.com", "/")).toBe("/")
    expect(safeRedirect("javascript:alert(1)", "/")).toBe("/")
    expect(safeRedirect(null, "/login")).toBe("/login")
    // dot-segment collapsing must not produce protocol-relative URLs
    expect(safeRedirect("/.//evil.com", "/")).toBe("/")
    expect(safeRedirect("/..//evil.com/phish", "/")).toBe("/")
    expect(safeRedirect("/%2e//evil.com", "/")).toBe("/")
    expect(safeRedirect("/a/../b", "/")).toBe("/b")
  })
})

describe("emailSchema", () => {
  it("normalizes and validates emails", () => {
    expect(emailSchema.parse("  Alice@Example.COM ")).toBe("alice@example.com")
    expect(emailSchema.safeParse("not-an-email").success).toBe(false)
  })
})

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Acme Inc.")).toBe("acme-inc")
    expect(slugify("Müller & Söhne GmbH")).toBe("muller-sohne-gmbh")
    expect(slugify("   ")).toBe("workspace")
    expect(RESERVED_SLUGS.has("admin")).toBe(true)
  })
})

describe("permissions", () => {
  it("gives owners every permission and guests very few", () => {
    expect(SYSTEM_ROLES.owner.permissions).toEqual(ALL_PERMISSIONS)
    expect(SYSTEM_ROLES.admin.permissions).not.toContain("billing.manage")
    expect(SYSTEM_ROLES.guest.permissions).toEqual(["conversations.read", "conversations.reply"])
    expect(SYSTEM_ROLES.guest.permissions).not.toContain("contacts.view")
    expect(hasPermission(new Set(["labels.manage"]), "labels.manage")).toBe(true)
    expect(hasPermission(["labels.manage"], "rules.manage")).toBe(false)
  })
})
