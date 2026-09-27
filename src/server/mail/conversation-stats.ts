import "server-only"
import { sql } from "drizzle-orm"
import type { DbOrTx } from "@/server/db"
import type { Conversation, Message } from "@/server/db/schema"

/**
 * Recompute a conversation's message aggregates from its messages so they
 * stay correct regardless of the order in which messages arrive (backfill,
 * multiple folders, sends): messageCount, hasAttachments, lastMessageAt,
 * lastInboundAt, lastOutboundAt, firstResponseAt and snippet.
 *
 * Only delivered messages count (status "received" or "sent"). The first
 * response is the first human outbound message after the first inbound one
 * (auto-replies and rule forwards carry an Auto-Submitted header and are
 * ignored). `activityAt` bumps lastActivityAt (which drives unread state).
 */
export async function refreshConversationStats(tx: DbOrTx, conversationId: string, activityAt?: Date | null) {
  await tx.execute(sql`
    with m as (
      select direction, has_attachments, snippet, headers,
             coalesce(sent_at, received_at, created_at) as d
      from messages
      where conversation_id = ${conversationId} and status in ('received', 'sent')
    ), agg as (
      select count(*)::int as cnt,
             coalesce(bool_or(has_attachments), false) as has_att,
             max(d) as last_at,
             max(d) filter (where direction = 'inbound') as last_in,
             max(d) filter (where direction = 'outbound') as last_out,
             min(d) filter (where direction = 'inbound') as first_in
      from m
    )
    update conversations c set
      message_count = agg.cnt,
      has_attachments = agg.has_att,
      last_message_at = agg.last_at,
      last_inbound_at = agg.last_in,
      last_outbound_at = agg.last_out,
      first_response_at = (
        select min(d) from m
        where direction = 'outbound' and not (headers ? 'auto-submitted') and agg.first_in is not null and d > agg.first_in
      ),
      snippet = coalesce((select snippet from m order by d desc limit 1), c.snippet),
      last_activity_at = greatest(c.last_activity_at, ${activityAt ? activityAt.toISOString() : null}::timestamptz),
      updated_at = now()
    from agg
    where c.id = ${conversationId}
  `)
}

/* ------------------------------ Webhook payloads ------------------------------ */

export function conversationPayload(c: Conversation) {
  return {
    id: c.id,
    number: c.number,
    subject: c.customSubject || c.subject,
    status: c.status,
    accountId: c.accountId,
    teamId: c.teamId,
    participants: c.participants,
    isSpam: c.isSpam,
    priority: c.priority,
    createdAt: c.createdAt.toISOString(),
  }
}

export function messagePayload(m: Message) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    accountId: m.accountId,
    direction: m.direction,
    status: m.status,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    from: { name: m.fromName, email: m.fromEmail },
    to: m.to,
    cc: m.cc,
    subject: m.subject,
    snippet: m.snippet,
    hasAttachments: m.hasAttachments,
    authorId: m.authorId,
    receivedAt: m.receivedAt?.toISOString() ?? null,
    sentAt: m.sentAt?.toISOString() ?? null,
  }
}
