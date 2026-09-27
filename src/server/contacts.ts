import "server-only"
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { db, schema, type DbOrTx } from "@/server/db"
import { getAccountAccess, visibleConversationsWhere } from "@/server/access"
import type { OrgContext } from "@/server/authz"
import { workspaceInboxAddresses } from "@/server/workspace/inbox-addresses"

/**
 * Address book.
 *
 * Contacts are unique per workspace and email (case-insensitive). A contact is
 * either shared (`ownerUserId` null, editable with `contacts.manage`) or
 * private to one member. The mail engine keeps them up to date through
 * `upsertContactsFromParticipants` while syncing and sending.
 */

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">
export type Contact = typeof schema.contacts.$inferSelect

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/

/** Addresses that never belong in an address book (bounces, robots, notifications). */
const SYSTEM_LOCAL_RE =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|notify|alerts?|automated|daemon|root|listserv|majordomo)([-_.+].*)?$/i
const SYSTEM_DOMAIN_RE = /(^|\.)(bounce|bounces|mailer|notifications?|email\.(amazonses|sendgrid|mailgun))\./i

export function normalizeEmail(email: string) {
  return email.trim().replace(/^mailto:/i, "").replace(/^<|>$/g, "").toLowerCase()
}

export function isValidEmail(email: string) {
  return email.length <= 254 && EMAIL_RE.test(email)
}

/** True for no-reply / bounce / notification senders that should not become contacts. */
export function isSystemAddress(email: string) {
  const [local = "", domain = ""] = normalizeEmail(email).split("@")
  if (!local || !domain) return true
  if (SYSTEM_LOCAL_RE.test(local)) return true
  if (local.includes("noreply") || local.includes("no-reply")) return true
  if (/^(bounce|return|srs\d?)[-+=]/i.test(local)) return true
  return SYSTEM_DOMAIN_RE.test(`${domain}.`)
}

/** Clean up a display name from a mail header ("'Doe, Jane'" → "Doe, Jane"; drops names that are just the address). */
export function cleanDisplayName(name: string | null | undefined, email: string) {
  if (!name) return null
  const n = name.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim()
  if (!n || n.includes("@") || n.toLowerCase() === email.toLowerCase()) return null
  return n.slice(0, 200)
}

/**
 * Contacts the member may see: their own private ones, plus the shared
 * address book with `contacts.view`. Without it (guests, restricted roles)
 * only the shared contacts of people in conversations they can see.
 */
export async function visibleContactsWhere(ctx: Ctx): Promise<SQL> {
  const c = schema.contacts
  const mine = eq(c.ownerUserId, ctx.user.id)
  if (ctx.permissions.has("contacts.view")) return and(eq(c.orgId, ctx.org.id), or(isNull(c.ownerUserId), mine))!
  const access = await getAccountAccess(ctx)
  const known = sql`select lower(p->>'email') from conversations, jsonb_array_elements(conversations.participants) p
    where ${visibleConversationsWhere(ctx, [...access.keys()])} and conversations.kind = 'email'`
  const involved = or(sql`lower(${c.email}) in (${known})`, sql`${c.alternateEmails} && array(${known})`)
  return and(eq(c.orgId, ctx.org.id), or(mine, and(isNull(c.ownerUserId), involved)))!
}

/** Page size limit: bulk reading the address book is reserved for members who may export it. */
function maxPageSize(ctx: Ctx) {
  return ctx.permissions.has("contacts.manage") || ctx.permissions.has("conversations.export") ? 500 : 100
}

/** Can the member edit this contact? Shared contacts need `contacts.manage`. */
export function canEditContact(ctx: Ctx, contact: Pick<Contact, "ownerUserId">) {
  if (contact.ownerUserId) return contact.ownerUserId === ctx.user.id
  return ctx.permissions.has("contacts.manage")
}

/* -------------------------------------------------------------------------- */
/*                         Sync from mail participants                        */
/* -------------------------------------------------------------------------- */

/** Lower-case SQL text[] literal built from bound parameters. */
function textArray(values: string[]) {
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )}]::text[]`
}

export type UpsertCandidate = { id: string; email: string; alternateEmails: string[]; ownerUserId: string | null }

/**
 * Decide what happens to each address of a message (pure; unit tested):
 *  - `insert`: create or bump by primary email (the insert's ON CONFLICT)
 *  - `bump`: ids of contacts that list the address as an alternate email
 *  - `skipped`: owner mode only, addresses the shared address book already knows
 * Primary emails win over alternates; only contacts in the upsert's scope
 * (shared, or the owner's private contacts) are touched.
 */
export function planContactUpsert(emails: string[], candidates: UpsertCandidate[], owner: string | null) {
  const inScope = (c: UpsertCandidate) => (owner ? c.ownerUserId === owner : c.ownerUserId === null)
  const sharedKnown = new Set<string>()
  const primary = new Set<string>()
  const alias = new Map<string, string>()
  for (const c of candidates) {
    const addresses = [c.email.toLowerCase(), ...c.alternateEmails.map((e) => e.toLowerCase())]
    if (owner && c.ownerUserId === null) for (const a of addresses) sharedKnown.add(a)
    if (!inScope(c)) continue
    primary.add(c.email.toLowerCase())
    for (const a of c.alternateEmails) if (!alias.has(a.toLowerCase())) alias.set(a.toLowerCase(), c.id)
  }
  const insert: string[] = []
  const bump = new Set<string>()
  const skipped: string[] = []
  for (const e of emails) {
    if (sharedKnown.has(e)) skipped.push(e)
    else if (primary.has(e)) insert.push(e)
    else if (alias.has(e)) bump.add(alias.get(e)!)
    else insert.push(e)
  }
  return { insert, bump: [...bump], skipped }
}

/** Addresses taken from one message (a mail with thousands of recipients must not flood the address book) */
const MAX_CONTACTS_PER_MESSAGE = 50

/**
 * Create or update contacts for the external participants of a message.
 * Increments `messageCount`, advances `lastContactedAt` and fills in missing
 * names. Addresses listed as a contact's alternate email count towards that
 * contact. Skips invalid and system addresses, the workspace's own inboxes and
 * workspace members. Safe to call for every synced or sent message.
 *
 * `ownerUserId` (personal inboxes): correspondents become the owner's private
 * contacts, never shared ones. Addresses already in the shared address book
 * (primary or alternate) are left untouched, so personal mail neither
 * duplicates nor reveals activity on shared contacts.
 */
export async function upsertContactsFromParticipants(
  orgId: string,
  participants: { name?: string | null; email: string }[],
  opts: { direction: "inbound" | "outbound"; at?: Date; tx?: DbOrTx; ownerUserId?: string | null } = { direction: "inbound" }
): Promise<number> {
  const tx = opts.tx ?? db
  const at = opts.at ?? new Date()
  const owner = opts.ownerUserId ?? null
  const unique = new Map<string, string | null>()
  for (const p of participants) {
    if (!p?.email) continue
    const email = normalizeEmail(p.email)
    if (!isValidEmail(email) || isSystemAddress(email)) continue
    // A single message can't flood the address book (the sender comes first)
    if (!unique.has(email) && unique.size >= MAX_CONTACTS_PER_MESSAGE) continue
    const name = cleanDisplayName(p.name, email)
    if (!unique.has(email) || (name && !unique.get(email))) unique.set(email, name)
  }
  if (!unique.size) return 0

  // Never add our own shared inboxes (and aliases), the owner's personal ones or teammates to the address book
  const emails = [...unique.keys()]
  const c = schema.contacts
  const [inboxes, members, candidates] = await Promise.all([
    workspaceInboxAddresses(orgId, { ownerUserId: owner, tx }),
    tx
      .select({ email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, orgId), inArray(sql`lower(${schema.users.email})`, emails))),
    // Shared contacts (and the owner's private ones) that know any of these addresses
    tx
      .select({ id: c.id, email: c.email, alternateEmails: c.alternateEmails, ownerUserId: c.ownerUserId })
      .from(c)
      .where(
        and(
          eq(c.orgId, orgId),
          owner ? or(isNull(c.ownerUserId), eq(c.ownerUserId, owner)) : isNull(c.ownerUserId),
          or(inArray(sql`lower(${c.email})`, emails), sql`${c.alternateEmails} && ${textArray(emails)}`)
        )
      ),
  ])
  const internal = new Set<string>(inboxes)
  for (const m of members) internal.add(m.email.toLowerCase())

  const plan = planContactUpsert(
    emails.filter((e) => !internal.has(e)),
    candidates,
    owner
  )

  if (plan.bump.length) {
    await tx
      .update(c)
      .set({
        messageCount: sql`${c.messageCount} + 1`,
        lastContactedAt: sql`greatest(${c.lastContactedAt}, ${at.toISOString()}::timestamptz)`,
      })
      .where(and(eq(c.orgId, orgId), inArray(c.id, plan.bump)))
  }
  if (plan.insert.length) {
    const values = sql.join(
      plan.insert.map((email) => sql`(${orgId}::uuid, ${owner}::uuid, ${email}, ${unique.get(email) ?? null}, ${at.toISOString()}::timestamptz, 1)`),
      sql`, `
    )
    // Arbiter: the shared index (owner null) or the owner's private index
    const target = owner
      ? sql`(org_id, owner_user_id, lower(email)) where owner_user_id is not null`
      : sql`(org_id, lower(email)) where owner_user_id is null`
    await tx.execute(sql`
      insert into contacts (org_id, owner_user_id, email, name, last_contacted_at, message_count)
      values ${values}
      on conflict ${target} do update set
        message_count = contacts.message_count + 1,
        last_contacted_at = greatest(contacts.last_contacted_at, excluded.last_contacted_at),
        name = coalesce(nullif(contacts.name, ''), excluded.name),
        updated_at = now()
    `)
  }
  return plan.insert.length + plan.bump.length
}

/* -------------------------------------------------------------------------- */
/*                                   Queries                                  */
/* -------------------------------------------------------------------------- */

/** Matches a contact whose primary or alternate email is `email` (already normalized). */
function hasAddress(email: string) {
  const c = schema.contacts
  return sql`(lower(${c.email}) = ${email} or ${email} = any(${c.alternateEmails}))`
}

/**
 * The contact for an address as the member sees it (primary or alternate
 * email): the shared one if it exists, else their private one; a primary
 * match wins over an alternate one.
 */
export async function getContactByEmail(ctx: Ctx, email: string) {
  const e = normalizeEmail(email)
  const [row] = await db
    .select()
    .from(schema.contacts)
    .where(and(await visibleContactsWhere(ctx), hasAddress(e)))
    .orderBy(sql`${schema.contacts.ownerUserId} is not null`, sql`lower(${schema.contacts.email}) <> ${e}`)
    .limit(1)
  return row ?? null
}

/**
 * Existing contact that a new/changed contact with these addresses would
 * collide with (primary or alternate emails): shared contacts are unique per
 * workspace, private ones per owner. A private copy of an address that is
 * already in the shared book is also refused.
 */
export async function findEmailConflict(
  ctx: Pick<Ctx, "org" | "user">,
  emails: string | string[],
  opts: { isPrivate: boolean; excludeId?: string }
) {
  const c = schema.contacts
  const list = [...new Set((Array.isArray(emails) ? emails : [emails]).map(normalizeEmail).filter(Boolean))]
  if (!list.length) return null
  const scope = opts.isPrivate ? or(isNull(c.ownerUserId), eq(c.ownerUserId, ctx.user.id))! : isNull(c.ownerUserId)
  const [row] = await db
    .select({ id: c.id, ownerUserId: c.ownerUserId, email: c.email, alternateEmails: c.alternateEmails })
    .from(c)
    .where(
      and(
        eq(c.orgId, ctx.org.id),
        or(inArray(sql`lower(${c.email})`, list), sql`${c.alternateEmails} && ${textArray(list)}`),
        scope,
        opts.excludeId ? sql`${c.id} <> ${opts.excludeId}` : undefined
      )
    )
    .orderBy(sql`${c.ownerUserId} is not null`)
    .limit(1)
  if (!row) return null
  const conflictingEmail =
    list.find((e) => e === row.email.toLowerCase()) ?? list.find((e) => row.alternateEmails.includes(e)) ?? list[0]!
  return { id: row.id, ownerUserId: row.ownerUserId, email: conflictingEmail }
}

export async function getContact(ctx: Ctx, id: string) {
  const [row] = await db
    .select()
    .from(schema.contacts)
    .where(and(await visibleContactsWhere(ctx), eq(schema.contacts.id, id)))
    .limit(1)
  return row ?? null
}

export type ContactSearch = {
  q?: string
  company?: string
  tag?: string
  scope?: "all" | "shared" | "private"
  sort?: "name" | "recent" | "company"
  limit?: number
  offset?: number
  /** Skip the count query (total is returned as -1) */
  withTotal?: boolean
}

export async function searchContacts(ctx: Ctx, opts: ContactSearch = {}) {
  const c = schema.contacts
  const conds: SQL[] = [await visibleContactsWhere(ctx)]
  const q = opts.q?.trim()
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    conds.push(
      or(
        ilike(c.name, like),
        ilike(c.email, like),
        ilike(c.company, like),
        ilike(c.title, like),
        ilike(c.phone, like),
        sql`exists (select 1 from unnest(${c.tags}) t where t ilike ${like})`,
        sql`exists (select 1 from unnest(${c.alternateEmails}) a where a ilike ${like})`
      )!
    )
  }
  if (opts.company === "") conds.push(sql`coalesce(${c.company}, '') = ''`)
  else if (opts.company) conds.push(sql`lower(${c.company}) = ${opts.company.toLowerCase()}`)
  if (opts.tag) conds.push(sql`${opts.tag} = any(${c.tags})`)
  if (opts.scope === "shared") conds.push(isNull(c.ownerUserId))
  if (opts.scope === "private") conds.push(eq(c.ownerUserId, ctx.user.id))
  const where = and(...conds)

  const nameKey = sql`lower(coalesce(nullif(${c.name}, ''), ${c.email}))`
  // id is the final tie-breaker so offset pagination never repeats or skips rows
  const order =
    opts.sort === "recent"
      ? [sql`${c.lastContactedAt} desc nulls last`, asc(nameKey), asc(c.id)]
      : opts.sort === "company"
        ? [sql`lower(${c.company}) asc nulls last`, asc(nameKey), asc(c.id)]
        : [asc(nameKey), asc(c.id)]
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), maxPageSize(ctx))
  const offset = Math.max(opts.offset ?? 0, 0)

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(c)
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset(offset),
    opts.withTotal === false ? Promise.resolve([{ total: -1 }]) : db.select({ total: sql<number>`count(*)::int` }).from(c).where(where),
  ])
  return { contacts: rows, total }
}

/** Companies and tags with counts, for the address book filters. */
export async function contactFacets(ctx: Ctx) {
  const c = schema.contacts
  const where = await visibleContactsWhere(ctx)
  const [companies, tags, [counts]] = await Promise.all([
    db
      .select({ name: sql<string>`min(${c.company})`, count: sql<number>`count(*)::int` })
      .from(c)
      .where(and(where, sql`coalesce(${c.company}, '') <> ''`))
      .groupBy(sql`lower(${c.company})`)
      .orderBy(sql`count(*) desc`, sql`lower(min(${c.company}))`)
      .limit(200),
    db.execute<{ tag: string; count: number }>(sql`
      select t as tag, count(*)::int as count
      from contacts, unnest(contacts.tags) t
      where ${where}
      group by t order by count(*) desc, t limit 100`),
    db
      .select({
        all: sql<number>`count(*)::int`,
        shared: sql<number>`count(*) filter (where ${c.ownerUserId} is null)::int`,
        private: sql<number>`count(*) filter (where ${c.ownerUserId} is not null)::int`,
      })
      .from(c)
      .where(where),
  ])
  return {
    companies,
    tags: [...tags].map((t) => ({ tag: t.tag, count: Number(t.count) })),
    counts: counts ?? { all: 0, shared: 0, private: 0 },
  }
}

export type ContactConversation = {
  id: string
  number: number
  subject: string
  snippet: string
  status: "open" | "closed"
  messageCount: number
  lastActivityAt: string
  account: { id: string; name: string; color: string } | null
}

/** Recent conversations involving any of the addresses that the member is allowed to see. */
export async function recentConversationsFor(
  ctx: Ctx,
  emails: string | string[],
  limit = 20
): Promise<{ conversations: ContactConversation[]; total: number }> {
  const access = await getAccountAccess(ctx)
  const conv = schema.conversations
  const list = [...new Set((Array.isArray(emails) ? emails : [emails]).map(normalizeEmail).filter(Boolean))]
  const involves = sql`exists (select 1 from jsonb_array_elements(${conv.participants}) p where lower(p->>'email') = any(${textArray(list)}))`
  const where = and(visibleConversationsWhere(ctx, [...access.keys()]), eq(conv.kind, "email"), eq(conv.isTrash, false), involves)
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: conv.id,
        number: conv.number,
        subject: conv.subject,
        customSubject: conv.customSubject,
        snippet: conv.snippet,
        status: conv.status,
        messageCount: conv.messageCount,
        lastActivityAt: conv.lastActivityAt,
        accountId: schema.accounts.id,
        accountName: schema.accounts.name,
        accountColor: schema.accounts.color,
      })
      .from(conv)
      .leftJoin(schema.accounts, eq(schema.accounts.id, conv.accountId))
      .where(where)
      .orderBy(desc(conv.lastActivityAt))
      .limit(limit),
    db.select({ total: sql<number>`count(*)::int` }).from(conv).where(where),
  ])
  return {
    total,
    conversations: rows.map((r) => ({
      id: r.id,
      number: r.number,
      subject: r.customSubject || r.subject,
      snippet: r.snippet,
      status: r.status,
      messageCount: r.messageCount,
      lastActivityAt: r.lastActivityAt.toISOString(),
      account: r.accountId ? { id: r.accountId, name: r.accountName!, color: r.accountColor! } : null,
    })),
  }
}

/** Serialize a contact for the client. */
export function contactDto(c: Contact, ctx: Ctx) {
  return {
    id: c.id,
    email: c.email,
    alternateEmails: c.alternateEmails,
    name: c.name,
    company: c.company,
    title: c.title,
    phone: c.phone,
    notes: c.notes,
    avatarUrl: c.avatarUrl,
    tags: c.tags,
    customFields: c.customFields,
    isPrivate: Boolean(c.ownerUserId),
    canEdit: canEditContact(ctx, c),
    lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
    messageCount: c.messageCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}
export type ContactDto = ReturnType<typeof contactDto>

/** Normalize user-entered tags (trimmed, lowercase-insensitive unique, max 20). */
export function normalizeTags(tags: string[] | undefined) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tags ?? []) {
    const v = t.trim().replace(/\s+/g, "-").slice(0, 40)
    if (!v || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
    if (out.length >= 20) break
  }
  return out
}

export const MAX_ALTERNATE_EMAILS = 20

/**
 * Normalize alternate emails: lower-case, valid, unique, without the primary
 * address. Returns the cleaned list and any entries that aren't valid emails.
 */
export function normalizeAlternateEmails(list: string[] | undefined, primary: string, max = MAX_ALTERNATE_EMAILS) {
  const out: string[] = []
  const invalid: string[] = []
  const main = normalizeEmail(primary)
  for (const raw of list ?? []) {
    const e = normalizeEmail(raw)
    if (!e || e === main || out.includes(e)) continue
    if (!isValidEmail(e)) invalid.push(raw)
    else out.push(e)
  }
  return { emails: out.slice(0, max), invalid }
}

/**
 * Alternate emails of a merge result: the target's own alternates plus every
 * merged-away address and its alternates (and legacy "Other emails" values),
 * so mail from any of them keeps landing on the merged contact.
 */
export function mergedAlternateEmails(
  target: Pick<Contact, "email" | "alternateEmails" | "customFields">,
  sources: Pick<Contact, "email" | "alternateEmails" | "customFields">[]
) {
  const all = [
    ...target.alternateEmails,
    ...legacyOtherEmails(target.customFields),
    ...sources.flatMap((s) => [s.email, ...s.alternateEmails, ...legacyOtherEmails(s.customFields)]),
  ]
  return normalizeAlternateEmails(all, target.email, 100).emails
}

/** Addresses from the legacy "Other emails" custom field (written by older merges). */
export function legacyOtherEmails(customFields: Record<string, string>) {
  return (customFields["Other emails"] ?? "")
    .split(/[,;\s]+/)
    .map((e) => normalizeEmail(e))
    .filter((e) => isValidEmail(e))
}

/** Clean custom fields (string values, max 30 keys). Empty values are dropped. */
export function normalizeCustomFields(fields: Record<string, string> | undefined) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields ?? {}).slice(0, 30)) {
    const key = k.trim().slice(0, 60)
    const value = String(v ?? "").trim().slice(0, 500)
    if (key && value) out[key] = value
  }
  return out
}

/** Postgres unique violation (possibly wrapped by drizzle), e.g. two members adding the same email at once. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === "23505" || e?.cause?.code === "23505"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value))
}

/** Body for creating/updating a contact (all fields optional on update). */
export const contactInput = z.object({
  email: z.string().trim().max(254),
  alternateEmails: z.array(z.string().trim().max(254)).max(50).optional(),
  name: z.string().trim().max(200).nullish(),
  company: z.string().trim().max(200).nullish(),
  title: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(60).nullish(),
  notes: z.string().max(10_000).nullish(),
  tags: z.array(z.string().max(60)).max(50).optional(),
  customFields: z.record(z.string(), z.string().max(500)).optional(),
  isPrivate: z.boolean().optional(),
})
