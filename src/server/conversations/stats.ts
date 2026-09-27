import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import { refreshConversationStats } from "@/server/mail/conversation-stats"
import type { Participant } from "@/lib/inbox/types"
import { mergeParticipants } from "./queries"

/**
 * Recompute all denormalized fields of a conversation after structural
 * changes (merge, cancelled send): message aggregates (shared with the mail
 * engine), comment count and external participants.
 */
export async function recomputeConversation(conversationId: string, tx: DbOrTx = db) {
  await refreshConversationStats(tx, conversationId)
  const [conv] = await tx
    .select({ accountId: schema.conversations.accountId, kind: schema.conversations.kind })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1)
  if (!conv) return

  const [{ count }] = (await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(and(eq(schema.comments.conversationId, conversationId), sql`${schema.comments.deletedAt} is null`))) as [{ count: number }]

  if (conv.kind !== "email") {
    await tx.update(schema.conversations).set({ commentCount: count }).where(eq(schema.conversations.id, conversationId))
    return
  }

  const accountEmails: string[] = []
  if (conv.accountId) {
    const [acc] = await tx
      .select({ email: schema.accounts.email, aliases: schema.accounts.aliases })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, conv.accountId))
      .limit(1)
    if (acc) accountEmails.push(acc.email, ...acc.aliases)
  }
  const msgs = await tx
    .select({ fromName: schema.messages.fromName, fromEmail: schema.messages.fromEmail, to: schema.messages.to, cc: schema.messages.cc })
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, conversationId), inArray(schema.messages.status, ["received", "sent", "sending", "queued", "scheduled"])))
  let participants: Participant[] = []
  for (const m of msgs) {
    participants = mergeParticipants(participants, [{ name: m.fromName, email: m.fromEmail }, ...m.to, ...m.cc], accountEmails)
  }
  await tx
    .update(schema.conversations)
    .set({ commentCount: count, participants })
    .where(eq(schema.conversations.id, conversationId))
}
