import { z } from "zod"
import { sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError, json, parseJson, parseQuery, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import {
  contactDto,
  contactInput,
  contactFacets,
  isUniqueViolation,
  isValidEmail,
  normalizeCustomFields,
  normalizeEmail,
  normalizeTags,
  searchContacts,
} from "@/server/contacts"

type P = { slug: string }

const listQuery = z.object({
  q: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  tag: z.string().max(60).optional(),
  scope: z.enum(["all", "shared", "private"]).optional(),
  sort: z.enum(["name", "recent", "company"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  facets: z.enum(["0", "1"]).optional(),
})

/** GET /api/w/[slug]/contacts?q&company&tag&scope&sort&limit&offset&facets=1 */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const query = parseQuery(req, listQuery)
  const [result, facets] = await Promise.all([
    searchContacts(ctx, query),
    query.facets === "1" ? contactFacets(ctx) : Promise.resolve(undefined),
  ])
  return json({
    contacts: result.contacts.map((c) => contactDto(c, ctx)),
    total: result.total,
    ...(facets ? { facets } : {}),
  })
})

/** POST /api/w/[slug]/contacts → ContactDto */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertWritable(ctx)
  const input = await parseJson(req, contactInput)
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new ApiError(400, "Enter a valid email address", "validation_error")
  if (!input.isPrivate && !ctx.permissions.has("contacts.manage")) {
    throw new ApiError(403, "You can only add private contacts. Ask an admin for the “Manage shared contacts” permission.", "forbidden")
  }
  // Uniqueness is per scope: one shared contact per address, one private contact per address per owner
  const existing = await db.query.contacts.findFirst({
    where: input.isPrivate
      ? sql`${schema.contacts.orgId} = ${ctx.org.id} and lower(${schema.contacts.email}) = ${email} and ${schema.contacts.ownerUserId} = ${ctx.user.id}`
      : sql`${schema.contacts.orgId} = ${ctx.org.id} and lower(${schema.contacts.email}) = ${email} and ${schema.contacts.ownerUserId} is null`,
    columns: { id: true },
  })
  if (existing) throw new ApiError(409, "A contact with this email already exists", "conflict", { id: existing.id })
  const [row] = await db
    .insert(schema.contacts)
    .values({
      orgId: ctx.org.id,
      ownerUserId: input.isPrivate ? ctx.user.id : null,
      email,
      name: input.name || null,
      company: input.company || null,
      title: input.title || null,
      phone: input.phone || null,
      notes: input.notes || null,
      tags: normalizeTags(input.tags),
      customFields: normalizeCustomFields(input.customFields),
    })
    .returning()
    .catch((err) => {
      if (isUniqueViolation(err)) throw new ApiError(409, "A contact with this email already exists", "conflict")
      throw err
    })
  return json(contactDto(row!, ctx), 201)
})
