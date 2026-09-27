import { z } from "zod"
import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { ApiError, json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertWritable } from "@/server/authz"
import { audit } from "@/server/audit"
import { canEditContact, contactDto, normalizeCustomFields, normalizeTags, visibleContactsWhere } from "@/server/contacts"

type P = { slug: string }

const body = z.object({
  targetId: z.uuid(),
  sourceIds: z.array(z.uuid()).min(1).max(20),
})

/**
 * POST /api/w/[slug]/contacts/merge { targetId, sourceIds } → ContactDto
 * Folds duplicates into the target: missing fields are filled in, tags and
 * custom fields are combined, the duplicates' addresses are kept under
 * "Other emails", message counts are summed. The duplicates are deleted.
 */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertWritable(ctx)
  const { targetId, sourceIds } = await parseJson(req, body)
  const ids = [...new Set([targetId, ...sourceIds])]
  if (ids.length < 2) throw new ApiError(400, "Select at least two different contacts", "validation_error")

  const rows = await db
    .select()
    .from(schema.contacts)
    .where(and(visibleContactsWhere(ctx), inArray(schema.contacts.id, ids)))
  const target = rows.find((r) => r.id === targetId)
  const sources = rows.filter((r) => r.id !== targetId)
  if (!target || sources.length !== ids.length - 1) throw new ApiError(404, "Contact not found", "not_found")
  if (!rows.every((r) => canEditContact(ctx, r))) throw new ApiError(403, "You can't edit all of these contacts", "forbidden")

  const otherEmails = new Set(
    (target.customFields["Other emails"] ?? "")
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
  )
  const customFields: Record<string, string> = {}
  for (const s of sources) {
    otherEmails.add(s.email)
    for (const [k, v] of Object.entries(s.customFields)) customFields[k] ??= v
  }
  Object.assign(customFields, target.customFields, { "Other emails": [...otherEmails].join(", ") })
  const notes = [target.notes, ...sources.map((s) => s.notes)].filter(Boolean).join("\n\n")
  const last = [target, ...sources]
    .map((r) => r.lastContactedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  const merged = await db.transaction(async (tx) => {
    await tx.delete(schema.contacts).where(and(eq(schema.contacts.orgId, ctx.org.id), inArray(schema.contacts.id, sources.map((s) => s.id))))
    const [row] = await tx
      .update(schema.contacts)
      .set({
        name: target.name || sources.find((s) => s.name)?.name || null,
        company: target.company || sources.find((s) => s.company)?.company || null,
        title: target.title || sources.find((s) => s.title)?.title || null,
        phone: target.phone || sources.find((s) => s.phone)?.phone || null,
        avatarUrl: target.avatarUrl || sources.find((s) => s.avatarUrl)?.avatarUrl || null,
        notes: notes ? notes.slice(0, 10_000) : null,
        tags: normalizeTags([...target.tags, ...sources.flatMap((s) => s.tags)]),
        customFields: normalizeCustomFields(customFields),
        messageCount: target.messageCount + sources.reduce((n, s) => n + s.messageCount, 0),
        lastContactedAt: last ?? null,
      })
      .where(eq(schema.contacts.id, target.id))
      .returning()
    return row!
  })

  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: "contact.merged",
    targetType: "contact",
    targetId: target.id,
    metadata: { merged: sources.map((s) => s.email) },
  })
  return json(contactDto(merged, ctx))
})
