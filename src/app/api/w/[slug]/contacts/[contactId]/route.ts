import { and, eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { audit } from "@/server/audit"
import {
  canEditContact,
  contactDto,
  contactInput,
  findEmailConflict,
  getContact,
  isUniqueViolation,
  isUuid,
  isValidEmail,
  normalizeCustomFields,
  normalizeEmail,
  normalizeTags,
  recentConversationsFor,
} from "@/server/contacts"

type P = { slug: string; contactId: string }

async function load(req: Parameters<typeof requireApiOrg>[0], params: Promise<P>) {
  const { slug, contactId } = await params
  const ctx = await requireApiOrg(req, slug)
  const contact = isUuid(contactId) ? await getContact(ctx, contactId) : null
  if (!contact) throw new ApiError(404, "Contact not found", "not_found")
  return { ctx, contact }
}

/** GET /api/w/[slug]/contacts/[contactId] → { contact, conversations, conversationTotal } */
export const GET = route<P>(async (req, { params }) => {
  const { ctx, contact } = await load(req, params)
  const { conversations, total } = await recentConversationsFor(ctx, contact.email, 30)
  return json({ contact: contactDto(contact, ctx), conversations, conversationTotal: total })
})

/** PATCH /api/w/[slug]/contacts/[contactId] → ContactDto */
export const PATCH = route<P>(async (req, { params }) => {
  const { ctx, contact } = await load(req, params)
  assertWritable(ctx)
  if (!canEditContact(ctx, contact)) throw new ApiError(403, "You can't edit this contact", "forbidden")
  const input = await parseJson(req, contactInput.partial())

  const patch: Partial<typeof schema.contacts.$inferInsert> = {}
  const willBePrivate = input.isPrivate ?? Boolean(contact.ownerUserId)
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email)
    if (!isValidEmail(email)) throw new ApiError(400, "Enter a valid email address", "validation_error")
    patch.email = email
  }
  // Emails are unique among shared contacts and among each member's private contacts
  if (input.email !== undefined || input.isPrivate !== undefined) {
    const conflict = await findEmailConflict(ctx, patch.email ?? contact.email, { isPrivate: willBePrivate, excludeId: contact.id })
    if (conflict) throw new ApiError(409, "Another contact already uses this email", "conflict")
  }
  if (input.name !== undefined) patch.name = input.name || null
  if (input.company !== undefined) patch.company = input.company || null
  if (input.title !== undefined) patch.title = input.title || null
  if (input.phone !== undefined) patch.phone = input.phone || null
  if (input.notes !== undefined) patch.notes = input.notes || null
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags)
  if (input.customFields !== undefined) patch.customFields = normalizeCustomFields(input.customFields)
  if (input.isPrivate !== undefined && input.isPrivate !== Boolean(contact.ownerUserId)) {
    // Moving between the shared address book and a private list needs contacts.manage
    if (!ctx.permissions.has("contacts.manage")) {
      throw new ApiError(403, "Only members who manage shared contacts can share or unshare contacts", "forbidden")
    }
    patch.ownerUserId = input.isPrivate ? ctx.user.id : null
  }
  if (!Object.keys(patch).length) return json(contactDto(contact, ctx))

  const [row] = await db
    .update(schema.contacts)
    .set(patch)
    .where(and(eq(schema.contacts.id, contact.id), eq(schema.contacts.orgId, ctx.org.id)))
    .returning()
    .catch((err) => {
      if (isUniqueViolation(err)) throw new ApiError(409, "Another contact already uses this email", "conflict")
      throw err
    })
  return json(contactDto(row!, ctx))
})

/** DELETE /api/w/[slug]/contacts/[contactId] */
export const DELETE = route<P>(async (req, { params }) => {
  const { ctx, contact } = await load(req, params)
  assertWritable(ctx)
  if (!canEditContact(ctx, contact)) throw new ApiError(403, "You can't delete this contact", "forbidden")
  await db.delete(schema.contacts).where(and(eq(schema.contacts.id, contact.id), eq(schema.contacts.orgId, ctx.org.id)))
  if (!contact.ownerUserId) {
    await audit({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      action: "contact.deleted",
      targetType: "contact",
      targetId: contact.id,
      metadata: { email: contact.email, name: contact.name },
    })
  }
  return json({ ok: true })
})
