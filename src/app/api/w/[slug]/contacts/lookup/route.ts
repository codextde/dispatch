import { z } from "zod"
import { ApiError, json, parseQuery, requireApiOrg, route } from "@/server/api"
import { assertApiScope } from "@/server/conversations/context"
import { contactDto, getContactByEmail, isValidEmail, normalizeEmail, recentConversationsFor } from "@/server/contacts"

type P = { slug: string }

const query = z.object({ email: z.string().max(254), limit: z.coerce.number().int().min(1).max(50).optional() })

/**
 * GET /api/w/[slug]/contacts/lookup?email=… → { email, contact | null, conversations, conversationTotal }
 * Used by the conversation sidebar card; conversations are limited to those the member can see.
 */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  assertApiScope(ctx, "contacts.read")
  const { email: raw, limit } = parseQuery(req, query)
  const email = normalizeEmail(raw)
  if (!isValidEmail(email)) throw new ApiError(400, "Invalid email address", "validation_error")
  // The address may be a contact's alternate email: show the contact and all of its conversations
  const contact = await getContactByEmail(ctx, email)
  const recent = await recentConversationsFor(ctx, contact ? [email, contact.email, ...contact.alternateEmails] : email, limit ?? 5)
  return json({
    email,
    contact: contact ? contactDto(contact, ctx) : null,
    conversations: recent.conversations,
    conversationTotal: recent.total,
  })
})
