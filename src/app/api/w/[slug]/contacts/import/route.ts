import { z } from "zod"
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { audit } from "@/server/audit"
import { rateLimit } from "@/server/rate-limit"
import { canEditContact, cleanDisplayName, isValidEmail, normalizeCustomFields, normalizeEmail, normalizeTags } from "@/server/contacts"

type P = { slug: string }

const row = z.object({
  email: z.string().max(320),
  name: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  phone: z.string().max(60).nullish(),
  notes: z.string().max(10_000).nullish(),
  tags: z.array(z.string().max(60)).max(50).optional(),
  customFields: z.record(z.string(), z.string().max(500)).optional(),
})

const body = z.object({
  contacts: z.array(row).min(1).max(5000),
  isPrivate: z.boolean().optional(),
  /** skip: keep existing contacts untouched; update: fill in / overwrite fields of existing contacts */
  mode: z.enum(["skip", "update"]).default("skip"),
})

/** POST /api/w/[slug]/contacts/import → { created, updated, skipped, invalid } */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertWritable(ctx)
  const input = await parseJson(req, body)
  if (!input.isPrivate && !ctx.permissions.has("contacts.manage")) {
    throw new ApiError(403, "Importing into the shared address book requires the “Manage shared contacts” permission", "forbidden")
  }
  const rl = await rateLimit(`contacts-import:${ctx.user.id}`, 20, 3600)
  if (!rl.ok) throw new ApiError(429, "Too many imports. Try again later.", "rate_limited")

  // Normalize + dedupe (last row wins)
  const byEmail = new Map<string, z.infer<typeof row> & { email: string }>()
  let invalid = 0
  for (const r of input.contacts) {
    const email = normalizeEmail(r.email)
    if (!isValidEmail(email)) {
      invalid++
      continue
    }
    byEmail.set(email, { ...r, email })
  }
  const emails = [...byEmail.keys()]
  let created = 0
  let updated = 0
  let skipped = 0

  await db.transaction(async (tx) => {
    // Rows this import collides with: shared contacts, plus the member's own private ones for private imports
    // (a private copy of an address that is already shared is skipped)
    const existing = emails.length
      ? await tx
          .select()
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.orgId, ctx.org.id),
              inArray(sql`lower(${schema.contacts.email})`, emails),
              input.isPrivate
                ? or(isNull(schema.contacts.ownerUserId), eq(schema.contacts.ownerUserId, ctx.user.id))
                : isNull(schema.contacts.ownerUserId)
            )
          )
          .orderBy(sql`${schema.contacts.ownerUserId} is null`)
      : []
    // Shared rows sort last, so they win when both exist
    const existingByEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c]))

    const inserts: (typeof schema.contacts.$inferInsert)[] = []
    for (const [email, r] of byEmail) {
      const current = existingByEmail.get(email)
      if (!current) {
        inserts.push({
          orgId: ctx.org.id,
          ownerUserId: input.isPrivate ? ctx.user.id : null,
          email,
          name: cleanDisplayName(r.name, email),
          company: r.company?.trim() || null,
          title: r.title?.trim() || null,
          phone: r.phone?.trim() || null,
          notes: r.notes?.trim() || null,
          tags: normalizeTags(r.tags),
          customFields: normalizeCustomFields(r.customFields),
        })
        continue
      }
      if (input.mode === "skip" || !canEditContact(ctx, current) || Boolean(current.ownerUserId) !== Boolean(input.isPrivate)) {
        skipped++
        continue
      }
      await tx
        .update(schema.contacts)
        .set({
          name: cleanDisplayName(r.name, email) ?? current.name,
          company: r.company?.trim() || current.company,
          title: r.title?.trim() || current.title,
          phone: r.phone?.trim() || current.phone,
          notes: r.notes?.trim() || current.notes,
          tags: normalizeTags([...current.tags, ...(r.tags ?? [])]),
          customFields: normalizeCustomFields({ ...current.customFields, ...(r.customFields ?? {}) }),
        })
        .where(eq(schema.contacts.id, current.id))
      updated++
    }
    for (let i = 0; i < inserts.length; i += 500) {
      const res = await tx
        .insert(schema.contacts)
        .values(inserts.slice(i, i + 500))
        .onConflictDoNothing()
        .returning({ id: schema.contacts.id })
      created += res.length
      skipped += inserts.slice(i, i + 500).length - res.length
    }
  })

  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: "contacts.imported",
    targetType: "contact",
    metadata: { created, updated, skipped, invalid, private: Boolean(input.isPrivate) },
  })
  return json({ created, updated, skipped, invalid })
})
