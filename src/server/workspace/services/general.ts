import "server-only"
import { and, eq, ne, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgSettings } from "@/server/db/schema"
import { RESERVED_SLUGS } from "@/server/orgs"
import { fail } from "@/server/workspace/context"

/** Workspace slug rules: 2–40 chars, lowercase letters, digits and single dashes. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$/

export async function validateNewSlug(orgId: string, raw: string): Promise<string> {
  const slug = raw.trim().toLowerCase()
  if (!SLUG_RE.test(slug)) fail("Use 2–40 lowercase letters, numbers and dashes (no leading, trailing or double dashes).")
  if (RESERVED_SLUGS.has(slug)) fail(`“${slug}” is reserved. Choose another URL.`)
  const [taken] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(and(eq(schema.organizations.slug, slug), ne(schema.organizations.id, orgId)))
    .limit(1)
  if (taken) fail("That URL is already taken.")
  return slug
}

const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Normalize a list of email domains ("@Acme.com " → "acme.com"), dedupe, validate. */
export function normalizeDomains(domains: string[]): string[] {
  const out = new Set<string>()
  for (const raw of domains) {
    const d = raw.trim().toLowerCase().replace(/^@/, "").replace(/^.*@/, "")
    if (!d) continue
    if (!DOMAIN_RE.test(d)) fail(`“${raw.trim()}” is not a valid domain.`)
    out.add(d)
  }
  if (out.size > 20) fail("Add at most 20 domains.")
  return [...out]
}

/** Public email providers can't be used for auto-join (anyone could join). */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "outlook.fr", "hotmail.com", "hotmail.de", "hotmail.co.uk",
  "hotmail.fr", "live.com", "live.de", "msn.com", "yahoo.com", "yahoo.de", "yahoo.co.uk", "yahoo.fr", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "aol.de", "proton.me", "protonmail.com", "pm.me", "gmx.de", "gmx.net",
  "gmx.at", "gmx.ch", "gmx.com", "web.de", "freenet.de", "posteo.de", "posteo.net", "mailbox.org", "t-online.de",
  "mail.com", "mail.ru", "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "fastmail.com",
  "hey.com", "tutanota.com", "tuta.io", "libero.it", "orange.fr", "free.fr", "laposte.net", "seznam.cz", "wp.pl",
])

/**
 * Domains "verified" for auto-join: the email domains of active members who
 * can manage workspace settings (their addresses are proven at sign-in). This
 * stops a workspace from claiming a domain nobody in it controls.
 */
export async function verifiedAdminDomains(orgId: string): Promise<Set<string>> {
  const rows = await db.execute<{ domain: string }>(sql`
    select distinct lower(split_part(u.email, '@', 2)) as domain
    from memberships m
    join users u on u.id = m.user_id
    join roles r on r.id = m.role_id
    where m.org_id = ${orgId} and m.status = 'active' and u.status = 'active'
      and (r.key = 'owner' or 'settings.manage' = any(r.permissions))`)
  return new Set(rows.map((r) => r.domain))
}

/**
 * Merge a patch into organizations.settings atomically (row lock), so
 * concurrent saves of different sections don't overwrite each other.
 */
export async function patchOrgSettings(orgId: string, patch: (current: OrgSettings) => OrgSettings): Promise<OrgSettings> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .for("update")
    const next = patch({ ...(row?.settings ?? {}) })
    await tx.update(schema.organizations).set({ settings: next }).where(eq(schema.organizations.id, orgId))
    return next
  })
}

/** Point members whose "last visited workspace" was the old slug at the new one. */
export async function migrateLastOrgSlug(oldSlug: string, newSlug: string) {
  await db.execute(sql`
    update users
    set preferences = jsonb_set(preferences, '{lastOrgSlug}', to_jsonb(${newSlug}::text))
    where preferences->>'lastOrgSlug' = ${oldSlug}`)
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
