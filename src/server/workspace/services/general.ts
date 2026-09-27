import "server-only"
import { and, eq, ne, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgSettings } from "@/server/db/schema"
import { RESERVED_SLUGS } from "@/server/orgs"
import { getSettings } from "@/server/settings"
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
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "outlook.fr", "outlook.es", "outlook.it", "outlook.at",
  "outlook.be", "outlook.cl", "outlook.co.id", "outlook.co.il", "outlook.co.nz", "outlook.co.th", "outlook.com.ar",
  "outlook.com.au", "outlook.com.br", "outlook.com.gr", "outlook.com.tr", "outlook.com.vn", "outlook.cz", "outlook.dk",
  "outlook.hu", "outlook.ie", "outlook.in", "outlook.jp", "outlook.kr", "outlook.lv", "outlook.my", "outlook.ph",
  "outlook.pt", "outlook.sa", "outlook.sg", "outlook.sk", "hotmail.com", "hotmail.de", "hotmail.co.uk", "hotmail.fr",
  "hotmail.it", "hotmail.es", "hotmail.nl", "hotmail.be", "hotmail.ch", "hotmail.at", "hotmail.se", "hotmail.no",
  "hotmail.dk", "hotmail.fi", "hotmail.gr", "hotmail.com.au", "hotmail.com.br", "hotmail.com.ar", "hotmail.com.mx",
  "hotmail.ca", "hotmail.co.jp", "live.com", "live.de", "live.co.uk", "live.fr", "live.it", "live.nl", "live.be",
  "live.at", "live.ch", "live.se", "live.no", "live.dk", "live.ie", "live.ca", "live.com.au", "live.com.mx",
  "live.com.ar", "live.cl", "live.jp", "msn.com", "passport.com", "windowslive.com", "yahoo.com", "yahoo.de",
  "yahoo.co.uk", "yahoo.fr", "yahoo.es", "yahoo.it", "yahoo.ca", "yahoo.com.au", "yahoo.com.br", "yahoo.com.ar",
  "yahoo.com.mx", "yahoo.co.jp", "yahoo.co.in", "yahoo.in", "yahoo.gr", "yahoo.se", "yahoo.dk", "yahoo.no",
  "yahoo.ie", "yahoo.co.nz", "yahoo.com.sg", "yahoo.com.hk", "yahoo.com.tw", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "aol.de", "aol.fr", "aol.co.uk", "aim.com", "proton.me",
  "protonmail.com", "protonmail.ch", "pm.me", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com", "gmx.fr",
  "gmx.co.uk", "gmx.us", "gmx.es", "gmx.it", "web.de", "freenet.de", "posteo.de", "posteo.net", "mailbox.org",
  "t-online.de", "magenta.de", "arcor.de", "vodafone.de", "online.de", "email.de", "mail.de", "kabelmail.de",
  "mail.com", "email.com", "mail.ru", "inbox.ru", "list.ru", "bk.ru", "rambler.ru", "zoho.com", "zoho.eu",
  "zohomail.com", "zohomail.eu", "yandex.com", "yandex.ru", "yandex.ua", "ya.ru", "qq.com", "163.com", "126.com",
  "yeah.net", "sina.com", "sohu.com", "aliyun.com", "naver.com", "daum.net", "hanmail.net", "fastmail.com",
  "fastmail.fm", "hey.com", "tutanota.com", "tutanota.de", "tutamail.com", "tuta.io", "tuta.com", "hushmail.com",
  "libero.it", "virgilio.it", "tiscali.it", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net",
  "seznam.cz", "wp.pl", "o2.pl", "onet.pl", "interia.pl", "rediffmail.com", "btinternet.com", "virginmedia.com",
  "sky.com", "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "earthlink.net", "juno.com", "optonline.net", "shaw.ca", "rogers.com", "sympatico.ca", "bigpond.com",
  "optusnet.com.au", "xtra.co.nz", "duck.com", "skiff.com", "startmail.com", "runbox.com", "mailfence.com",
])

/** Webmail brands: `<brand>.<country suffix>` is a public provider even when missing from the list above. */
const PUBLIC_EMAIL_BRANDS = new Set([
  "gmail", "googlemail", "outlook", "hotmail", "live", "msn", "windowslive", "yahoo", "ymail", "rocketmail", "aol",
  "icloud", "proton", "protonmail", "gmx", "yandex", "zoho", "zohomail", "tutanota", "tutamail", "fastmail", "hushmail",
])

/**
 * Is this a public (webmail / ISP) email domain that anyone can register an
 * address at? Matches the list above plus `<brand>.<tld>` and
 * `<brand>.co.<cc>` / `<brand>.com.<cc>` variants of well-known webmail brands.
 */
export function isPublicEmailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "")
  if (PUBLIC_EMAIL_DOMAINS.has(d)) return true
  const m = d.match(/^([a-z0-9-]+)\.((?:(?:co|com|net|org|ne|or)\.)?[a-z]{2,6})$/)
  return Boolean(m && PUBLIC_EMAIL_BRANDS.has(m[1]!))
}

/**
 * Domains "verified" for auto-join: the email domains of active members who
 * can manage workspace settings (their addresses are proven at sign-in). This
 * stops a workspace from claiming a domain nobody in it controls. Public
 * providers never qualify, and in SaaS mode the domain must also be approved
 * by a super admin (Admin → Settings → Authentication).
 */
export async function verifiedAdminDomains(orgId: string): Promise<Set<string>> {
  const rows = await db.execute<{ domain: string }>(sql`
    select distinct lower(split_part(u.email, '@', 2)) as domain
    from memberships m
    join users u on u.id = m.user_id
    join roles r on r.id = m.role_id
    where m.org_id = ${orgId} and m.status = 'active' and u.status = 'active'
      and (r.key = 'owner' or 'settings.manage' = any(r.permissions))`)
  const approved = await approvedAutoJoinDomains()
  return new Set(rows.map((r) => r.domain).filter((d) => !isPublicEmailDomain(d) && (!approved || approved.has(d))))
}

/**
 * Domains a super admin approved for auto-join, or `null` when no approval is
 * needed (private/self-hosted mode, where the instance admin runs every workspace).
 */
export async function approvedAutoJoinDomains(): Promise<Set<string> | null> {
  const [general, auth] = await Promise.all([getSettings("general"), getSettings("auth")])
  if (general.mode !== "saas") return null
  return new Set(auth.verifiedAutoJoinDomains.map((d) => d.trim().toLowerCase().replace(/^@/, "")))
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
