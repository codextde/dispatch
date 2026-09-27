import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { publish } from "@/server/realtime"
import { enqueueJob } from "@/server/jobs"

export type NotifyInput = {
  orgId: string
  userIds: string[]
  /** mention | assigned | reply | comment | task | reminder | chat */
  type: string
  title: string
  body?: string | null
  actorId?: string | null
  conversationId?: string | null
  commentId?: string | null
  data?: Record<string, unknown>
}

/**
 * Create in-app notifications (bell + realtime) and queue email
 * notifications according to each user's preferences. The actor never
 * notifies themselves.
 */
export async function notify(input: NotifyInput) {
  const recipients = [...new Set(input.userIds)].filter((id) => id && id !== input.actorId)
  if (!recipients.length) return []

  // Only notify active members of the workspace
  const members = await db
    .select({ userId: schema.memberships.userId, prefs: schema.users.preferences, awayUntil: schema.users.awayUntil })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.orgId, input.orgId),
        eq(schema.memberships.status, "active"),
        inArray(schema.memberships.userId, recipients)
      )
    )
  if (!members.length) return []

  const rows = await db
    .insert(schema.notifications)
    .values(
      members.map((m) => ({
        orgId: input.orgId,
        userId: m.userId,
        type: input.type,
        actorId: input.actorId ?? null,
        conversationId: input.conversationId ?? null,
        commentId: input.commentId ?? null,
        title: input.title.slice(0, 300),
        body: input.body?.slice(0, 1000) ?? null,
        data: input.data ?? {},
      }))
    )
    .returning()

  await publish({
    orgId: input.orgId,
    type: "notification.created",
    userIds: members.map((m) => m.userId),
    conversationId: input.conversationId ?? undefined,
    actorId: input.actorId ?? undefined,
  })

  for (const row of rows) {
    const prefs = members.find((m) => m.userId === row.userId)?.prefs?.notifications
    const wantsEmail =
      prefs?.email !== false &&
      ((input.type === "mention" && prefs?.mentions !== false) || (input.type === "assigned" && prefs?.assignments !== false))
    if (wantsEmail) {
      // Delay slightly so we don't email when the user is actively looking at the app
      await enqueueJob("notify.email", { notificationId: row.id }, { runAt: new Date(Date.now() + 60_000) })
    }
  }
  return rows
}
