import "server-only"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { publish } from "@/server/realtime"
import { nextConversationNumber } from "@/server/orgs"
import { activeMemberIds, addEvent, upsertUserState } from "./mutations"
import type { Ctx } from "./scope"

export const createChatSchema = z.object({
  name: z.string().trim().max(80).optional(),
  memberIds: z.array(z.uuid()).min(1).max(100),
})

export const updateChatSchema = z.object({
  name: z.string().trim().max(80).optional(),
  addMemberIds: z.array(z.uuid()).max(100).optional(),
  removeMemberIds: z.array(z.uuid()).max(100).optional(),
  leave: z.boolean().optional(),
})

/**
 * Create an internal chat room (conversation kind "chat"). Direct messages
 * (two members, no name) are de-duplicated: the existing DM is returned.
 */
export async function createChat(ctx: Ctx, input: z.infer<typeof createChatSchema>) {
  if (!ctx.permissions.has("chats.create")) throw new ApiError(403, "You don't have permission to create chats", "forbidden")
  const me = ctx.user.id
  const requested = [...new Set([me, ...input.memberIds])]
  const valid = await activeMemberIds(ctx.org.id, requested)
  const memberIds = requested.filter((id) => valid.has(id))
  if (memberIds.length < 2) throw new ApiError(400, "Pick at least one teammate", "invalid_members")
  const name = input.name?.trim() ?? ""

  if (!name && memberIds.length === 2) {
    const [existing] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.orgId, ctx.org.id),
          eq(schema.conversations.kind, "chat"),
          eq(schema.conversations.subject, ""),
          isNull(schema.conversations.mergedIntoId),
          sql`${schema.conversations.chatMemberIds} @> ${sql`array[${sql.join(memberIds.map((id) => sql`${id}::uuid`), sql`, `)}]`} and cardinality(${schema.conversations.chatMemberIds}) = 2`
        )
      )
      .limit(1)
    if (existing) return { id: existing.id, created: false }
  }

  const conv = await db.transaction(async (tx) => {
    const number = await nextConversationNumber(ctx.org.id, tx)
    const [created] = await tx
      .insert(schema.conversations)
      .values({ orgId: ctx.org.id, number, kind: "chat", subject: name, chatMemberIds: memberIds, createdBy: me })
      .returning()
    await addEvent(tx, ctx.org.id, created!.id, me, "chat_created", { memberIds })
    await upsertUserState(tx, created!.id, me, { lastReadAt: new Date(), unread: false })
    return created!
  })
  await publish({ orgId: ctx.org.id, type: "conversation.created", conversationId: conv.id, actorId: me, userIds: memberIds })
  return { id: conv.id, created: true }
}

export async function updateChat(ctx: Ctx, chatId: string, input: z.infer<typeof updateChatSchema>) {
  const me = ctx.user.id
  const conv = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, chatId), eq(schema.conversations.orgId, ctx.org.id), eq(schema.conversations.kind, "chat")),
  })
  if (!conv || !conv.chatMemberIds.includes(me)) throw new ApiError(404, "Chat not found", "not_found")
  const isDirect = !conv.subject && conv.chatMemberIds.length === 2
  let members = [...conv.chatMemberIds]
  const events: { type: string; data: Record<string, unknown> }[] = []

  if (input.leave) {
    members = members.filter((id) => id !== me)
    events.push({ type: "chat_left", data: { userIds: [me] } })
  }
  if (input.addMemberIds?.length) {
    if (isDirect) throw new ApiError(400, "Create a group chat to add more people", "direct_chat")
    const valid = await activeMemberIds(ctx.org.id, input.addMemberIds)
    const added = input.addMemberIds.filter((id) => valid.has(id) && !members.includes(id))
    members.push(...added)
    if (added.length) events.push({ type: "chat_members_added", data: { userIds: added } })
  }
  if (input.removeMemberIds?.length) {
    if (isDirect) throw new ApiError(400, "You can't remove people from a direct message", "direct_chat")
    const removed = input.removeMemberIds.filter((id) => members.includes(id) && id !== me)
    members = members.filter((id) => !removed.includes(id))
    if (removed.length) events.push({ type: "chat_members_removed", data: { userIds: removed } })
  }
  const set: Partial<typeof schema.conversations.$inferInsert> = { chatMemberIds: members }
  if (input.name !== undefined && input.name !== conv.subject) {
    if (isDirect && input.name) throw new ApiError(400, "Direct messages can't be renamed", "direct_chat")
    set.subject = input.name
    events.push({ type: "chat_renamed", data: { name: input.name } })
  }

  await db.transaction(async (tx) => {
    await tx.update(schema.conversations).set(set).where(eq(schema.conversations.id, chatId))
    for (const e of events) await addEvent(tx, ctx.org.id, chatId, me, e.type, e.data)
  })
  await publish({
    orgId: ctx.org.id,
    type: "conversation.updated",
    conversationId: chatId,
    actorId: me,
    userIds: [...new Set([...conv.chatMemberIds, ...members])],
  })
  return { id: chatId, memberIds: members, name: set.subject ?? conv.subject }
}
