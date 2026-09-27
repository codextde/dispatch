import "server-only"
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema, type Tx } from "@/server/db"
import { ApiError } from "@/server/api"
import { publish } from "@/server/realtime"
import { emitWebhook } from "@/server/jobs"
import { notify } from "@/server/notifications"
import { audit } from "@/server/audit"
import { deleteObject } from "@/server/storage"
import type { ConversationPatch } from "@/lib/inbox/types"
import { atLeast, loadAccessible, type AccessibleConversation, type Ctx, type InboxScope } from "./scope"
import { recomputeConversation } from "./stats"

const c = schema.conversations
const cus = schema.conversationUserState

const ids = (max: number) => z.array(z.uuid()).max(max)

export const conversationPatchSchema = z
  .object({
    status: z.enum(["open", "closed"]),
    snoozedUntil: z.iso.datetime({ offset: true }).nullable(),
    teamId: z.uuid().nullable(),
    priority: z.boolean(),
    subject: z.string().trim().max(300).nullable(),
    spam: z.boolean(),
    trash: z.boolean(),
    starred: z.boolean(),
    pinned: z.boolean(),
    following: z.boolean(),
    muted: z.boolean(),
    read: z.boolean(),
    assigneeIds: ids(20),
    addAssigneeIds: ids(20),
    removeAssigneeIds: ids(20),
    labelIds: ids(50),
    addLabelIds: ids(50),
    removeLabelIds: ids(50),
  })
  .partial() satisfies z.ZodType<ConversationPatch>

export type PatchInput = z.infer<typeof conversationPatchSchema>

const CONVERSATION_FIELDS = ["status", "snoozedUntil", "teamId", "priority", "subject", "spam", "labelIds", "addLabelIds", "removeLabelIds"] as const
const ASSIGN_FIELDS = ["assigneeIds", "addAssigneeIds", "removeAssigneeIds"] as const
const USER_FIELDS = ["starred", "pinned", "following", "muted", "read"] as const

export function actorName(ctx: Ctx) {
  return ctx.user.name || ctx.user.email
}

export function displaySubject(conv: { customSubject: string | null; subject: string; number: number }) {
  return conv.customSubject || conv.subject || `Conversation #${conv.number}`
}

export async function addEvent(tx: Tx | typeof db, orgId: string, conversationId: string, actorId: string | null, type: string, data: Record<string, unknown> = {}) {
  await tx.insert(schema.conversationEvents).values({ orgId, conversationId, actorId, type, data })
}

export async function upsertUserState(
  tx: Tx | typeof db,
  conversationId: string,
  userId: string,
  set: Partial<Pick<typeof cus.$inferInsert, "lastReadAt" | "unread" | "starred" | "pinned" | "following" | "muted">>
) {
  await tx
    .insert(cus)
    .values({ conversationId, userId, unread: false, ...set })
    .onConflictDoUpdate({ target: [cus.conversationId, cus.userId], set: { ...set, updatedAt: new Date() } })
}

/** Mark conversations as read for a user (and their notifications about them). */
export async function markRead(orgId: string, userId: string, conversationIds: string[], read: boolean, tx: Tx | typeof db = db) {
  if (!conversationIds.length) return
  const now = new Date()
  for (const id of conversationIds) {
    await upsertUserState(tx, id, userId, read ? { lastReadAt: now, unread: false } : { lastReadAt: null, unread: true })
  }
  if (read) {
    await tx
      .update(schema.notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(schema.notifications.orgId, orgId),
          eq(schema.notifications.userId, userId),
          inArray(schema.notifications.conversationId, conversationIds),
          isNull(schema.notifications.readAt)
        )
      )
  }
}

/** Active members of the workspace among `userIds`. */
export async function activeMemberIds(orgId: string, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.orgId, orgId),
        eq(schema.memberships.status, "active"),
        eq(schema.users.status, "active"),
        inArray(schema.memberships.userId, userIds)
      )
    )
  return new Set(rows.map((r) => r.userId))
}

type Effects = {
  events: number
  publish: Set<string>
  webhooks: { event: "conversation.closed" | "conversation.reopened" | "conversation.assigned" | "conversation.labeled"; data: Record<string, unknown> }[]
  assigned: { conversationId: string; subject: string; userIds: string[] }[]
}

/**
 * Apply a patch to one or many conversations. Invisible ids are ignored;
 * conversations the user may not change are skipped (403 when none could be
 * changed). Returns the ids that were processed.
 */
export async function applyConversationPatch(
  ctx: Ctx,
  scope: InboxScope,
  conversationIds: string[],
  patch: PatchInput
): Promise<{ updated: string[]; skipped: string[] }> {
  const me = ctx.user.id
  const rows = await loadAccessible(ctx, scope, [...new Set(conversationIds)])
  if (!rows.length) throw new ApiError(404, "Conversation not found", "not_found")

  const has = (k: keyof PatchInput) => patch[k] !== undefined
  const touchesConversation = CONVERSATION_FIELDS.some(has)
  const touchesAssignees = ASSIGN_FIELDS.some(has)
  const touchesTrash = has("trash")

  if (touchesTrash && !ctx.permissions.has("conversations.delete")) {
    throw new ApiError(403, "You don't have permission to delete conversations", "forbidden")
  }

  // Validate referenced entities once.
  if (patch.teamId) {
    const team = await db.query.teams.findFirst({
      where: and(eq(schema.teams.id, patch.teamId), eq(schema.teams.orgId, ctx.org.id)),
      columns: { id: true },
    })
    if (!team) throw new ApiError(400, "Unknown team", "invalid_team")
  }
  const requestedAssignees = [...new Set([...(patch.assigneeIds ?? []), ...(patch.addAssigneeIds ?? [])])]
  if (requestedAssignees.length) {
    const valid = await activeMemberIds(ctx.org.id, requestedAssignees)
    const invalid = requestedAssignees.filter((u) => !valid.has(u))
    if (invalid.length) throw new ApiError(400, "Can only assign active members of this workspace", "invalid_assignee")
  }
  if (touchesAssignees && !ctx.permissions.has("conversations.assign")) {
    // Without the permission, members may only (un)assign themselves.
    const others = [...requestedAssignees, ...(patch.removeAssigneeIds ?? [])].filter((u) => u !== me)
    if (others.length) throw new ApiError(403, "You don't have permission to assign conversations to others", "forbidden")
  }
  const requestedLabels = [...new Set([...(patch.labelIds ?? []), ...(patch.addLabelIds ?? []), ...(patch.removeLabelIds ?? [])])]
  let visibleLabelIds = new Set<string>()
  if (requestedLabels.length || patch.labelIds) {
    const labelRows = await db
      .select({ id: schema.labels.id })
      .from(schema.labels)
      .where(
        and(
          eq(schema.labels.orgId, ctx.org.id),
          or(eq(schema.labels.visibility, "shared"), eq(schema.labels.ownerUserId, me))
        )
      )
    visibleLabelIds = new Set(labelRows.map((l) => l.id))
    if (requestedLabels.some((l) => !visibleLabelIds.has(l))) throw new ApiError(400, "Unknown label", "invalid_label")
  }
  if (patch.snoozedUntil && new Date(patch.snoozedUntil).getTime() <= Date.now()) {
    throw new ApiError(400, "Snooze time must be in the future", "invalid_snooze")
  }

  const updated: string[] = []
  const skipped: string[] = []
  const effects: Effects = { events: 0, publish: new Set(), webhooks: [], assigned: [] }
  const canWorkOn = (r: AccessibleConversation) => {
    if (r.conversation.kind === "chat") return false
    return atLeast(r.level, "reply") || (touchesAssignees && !touchesConversation && ctx.permissions.has("conversations.assign"))
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const conv = row.conversation
      const needsWrite = touchesConversation || touchesAssignees || touchesTrash
      if (needsWrite && !canWorkOn(row)) {
        skipped.push(conv.id)
        // Per-user flags can still be applied below.
        if (!USER_FIELDS.some(has)) continue
      } else if (needsWrite) {
        await applyToConversation(tx, ctx, row, patch, visibleLabelIds, effects)
      }
      await applyUserState(tx, ctx, conv.id, patch)
      updated.push(conv.id)
      effects.publish.add(conv.id)
    }
  })

  if (!updated.length) throw new ApiError(403, "You don't have permission to change these conversations", "forbidden")

  // Side effects after commit.
  if (patch.read === true) {
    await markReadNotifications(ctx.org.id, me, updated)
  }
  for (const a of effects.assigned) {
    await notify({
      orgId: ctx.org.id,
      userIds: a.userIds,
      type: "assigned",
      title: `${actorName(ctx)} assigned you “${a.subject}”`,
      actorId: me,
      conversationId: a.conversationId,
    })
  }
  for (const w of effects.webhooks) await emitWebhook(ctx.org.id, w.event, w.data)
  await publishConversations(ctx.org.id, [...effects.publish], me)
  return { updated, skipped }
}

async function markReadNotifications(orgId: string, userId: string, conversationIds: string[]) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.orgId, orgId),
        eq(schema.notifications.userId, userId),
        inArray(schema.notifications.conversationId, conversationIds),
        isNull(schema.notifications.readAt)
      )
    )
}

export async function publishConversations(orgId: string, conversationIds: string[], actorId: string, type: "conversation.updated" | "conversation.deleted" = "conversation.updated") {
  if (conversationIds.length > 20) {
    await publish({ orgId, type, actorId, data: { count: conversationIds.length } })
    return
  }
  for (const id of conversationIds) await publish({ orgId, type, conversationId: id, actorId })
}

async function applyUserState(tx: Tx, ctx: Ctx, conversationId: string, patch: PatchInput) {
  const set: Parameters<typeof upsertUserState>[3] = {}
  if (patch.starred !== undefined) set.starred = patch.starred
  if (patch.pinned !== undefined) set.pinned = patch.pinned
  if (patch.following !== undefined) set.following = patch.following
  if (patch.muted !== undefined) set.muted = patch.muted
  if (patch.read !== undefined) {
    set.lastReadAt = patch.read ? new Date() : null
    set.unread = !patch.read
  }
  if (Object.keys(set).length) await upsertUserState(tx, conversationId, ctx.user.id, set)
}

async function applyToConversation(
  tx: Tx,
  ctx: Ctx,
  row: AccessibleConversation,
  patch: PatchInput,
  visibleLabelIds: Set<string>,
  effects: Effects
) {
  const me = ctx.user.id
  const orgId = ctx.org.id
  const conv = row.conversation
  const set: Partial<typeof c.$inferInsert> = {}
  const events: { type: string; data?: Record<string, unknown> }[] = []
  const subject = displaySubject(conv)

  if (patch.status && patch.status !== conv.status) {
    if (patch.status === "closed") {
      Object.assign(set, { status: "closed", closedAt: new Date(), closedBy: me })
      events.push({ type: "closed" })
      effects.webhooks.push({ event: "conversation.closed", data: { conversationId: conv.id, number: conv.number, closedBy: me } })
    } else {
      Object.assign(set, { status: "open", closedAt: null, closedBy: null })
      events.push({ type: "reopened" })
      effects.webhooks.push({ event: "conversation.reopened", data: { conversationId: conv.id, number: conv.number, reopenedBy: me } })
    }
  }
  if (patch.snoozedUntil !== undefined) {
    if (patch.snoozedUntil) {
      set.snoozedUntil = new Date(patch.snoozedUntil)
      set.snoozedBy = me
      events.push({ type: "snoozed", data: { until: patch.snoozedUntil } })
    } else if (conv.snoozedUntil) {
      set.snoozedUntil = null
      set.snoozedBy = null
      events.push({ type: "unsnoozed" })
    }
  }
  if (patch.teamId !== undefined && patch.teamId !== conv.teamId) {
    set.teamId = patch.teamId
    events.push({ type: "moved", data: { teamId: patch.teamId, fromTeamId: conv.teamId } })
  }
  if (patch.priority !== undefined && patch.priority !== conv.priority) {
    set.priority = patch.priority
    events.push({ type: "priority", data: { value: patch.priority } })
  }
  if (patch.subject !== undefined) {
    const value = patch.subject?.trim() || null
    if (value !== conv.customSubject) {
      set.customSubject = value
      events.push({ type: "subject_changed", data: { subject: value } })
    }
  }
  if (patch.spam !== undefined && patch.spam !== conv.isSpam) {
    set.isSpam = patch.spam
    events.push({ type: patch.spam ? "spam" : "not_spam" })
  }
  if (patch.trash !== undefined && patch.trash !== conv.isTrash) {
    set.isTrash = patch.trash
    events.push({ type: patch.trash ? "trashed" : "restored" })
  }

  if (Object.keys(set).length) await tx.update(c).set(set).where(eq(c.id, conv.id))

  // Assignees
  if (patch.assigneeIds || patch.addAssigneeIds || patch.removeAssigneeIds) {
    const current = (
      await tx
        .select({ userId: schema.conversationAssignees.userId })
        .from(schema.conversationAssignees)
        .where(eq(schema.conversationAssignees.conversationId, conv.id))
    ).map((r) => r.userId)
    let target = new Set(current)
    if (patch.assigneeIds) target = new Set(patch.assigneeIds)
    for (const u of patch.addAssigneeIds ?? []) target.add(u)
    for (const u of patch.removeAssigneeIds ?? []) target.delete(u)
    if (!ctx.permissions.has("conversations.assign")) {
      // Keep other people's assignments untouched.
      for (const u of current) if (u !== me) target.add(u)
    }
    const added = [...target].filter((u) => !current.includes(u))
    const removed = current.filter((u) => !target.has(u))
    if (added.length) {
      await tx
        .insert(schema.conversationAssignees)
        .values(added.map((userId) => ({ conversationId: conv.id, userId, assignedBy: me })))
        .onConflictDoNothing()
      for (const u of added) await upsertUserState(tx, conv.id, u, { following: true })
      events.push({ type: "assigned", data: { userIds: added } })
      effects.webhooks.push({ event: "conversation.assigned", data: { conversationId: conv.id, number: conv.number, userIds: added, assignedBy: me } })
      const others = added.filter((u) => u !== me)
      if (others.length) effects.assigned.push({ conversationId: conv.id, subject, userIds: others })
    }
    if (removed.length) {
      await tx
        .delete(schema.conversationAssignees)
        .where(and(eq(schema.conversationAssignees.conversationId, conv.id), inArray(schema.conversationAssignees.userId, removed)))
      events.push({ type: "unassigned", data: { userIds: removed } })
    }
  }

  // Labels (only labels visible to the actor are touched)
  if (patch.labelIds || patch.addLabelIds || patch.removeLabelIds) {
    const current = (
      await tx
        .select({ labelId: schema.conversationLabels.labelId })
        .from(schema.conversationLabels)
        .where(eq(schema.conversationLabels.conversationId, conv.id))
    )
      .map((r) => r.labelId)
      .filter((l) => visibleLabelIds.has(l))
    let target = new Set(current)
    if (patch.labelIds) target = new Set(patch.labelIds)
    for (const l of patch.addLabelIds ?? []) target.add(l)
    for (const l of patch.removeLabelIds ?? []) target.delete(l)
    const added = [...target].filter((l) => !current.includes(l))
    const removed = current.filter((l) => !target.has(l))
    if (added.length) {
      await tx
        .insert(schema.conversationLabels)
        .values(added.map((labelId) => ({ conversationId: conv.id, labelId, addedBy: me })))
        .onConflictDoNothing()
      events.push({ type: "labeled", data: { labelIds: added } })
      effects.webhooks.push({ event: "conversation.labeled", data: { conversationId: conv.id, number: conv.number, labelIds: added, labeledBy: me } })
    }
    if (removed.length) {
      await tx
        .delete(schema.conversationLabels)
        .where(and(eq(schema.conversationLabels.conversationId, conv.id), inArray(schema.conversationLabels.labelId, removed)))
      events.push({ type: "unlabeled", data: { labelIds: removed } })
    }
  }

  if (events.length) {
    await tx.insert(schema.conversationEvents).values(
      events.map((e) => ({ orgId, conversationId: conv.id, actorId: me, type: e.type, data: e.data ?? {} }))
    )
    effects.events += events.length
  }
}

/* --------------------------------- Merge ---------------------------------- */

/**
 * Merge `sourceIds` into `targetId`: messages, comments, events, tasks,
 * assignees and labels move to the target; sources get `mergedIntoId` and
 * disappear from every box.
 */
export async function mergeConversations(ctx: Ctx, scope: InboxScope, targetId: string, sourceIds: string[]) {
  if (sourceIds.includes(targetId)) throw new ApiError(400, "A conversation can't be merged into itself", "invalid_merge")
  const all = await loadAccessible(ctx, scope, [targetId, ...sourceIds])
  const target = all.find((r) => r.conversation.id === targetId)
  const sources = all.filter((r) => r.conversation.id !== targetId)
  if (!target) throw new ApiError(404, "Target conversation not found", "not_found")
  if (!sources.length) throw new ApiError(404, "Conversation not found", "not_found")
  for (const r of [target, ...sources]) {
    if (r.conversation.kind !== "email") throw new ApiError(400, "Only email conversations can be merged", "invalid_merge")
    if (!atLeast(r.level, "reply")) throw new ApiError(403, "You don't have permission to merge these conversations", "forbidden")
  }
  const sids = sources.map((s) => s.conversation.id)
  await db.transaction(async (tx) => {
    await tx.update(schema.messages).set({ conversationId: targetId }).where(inArray(schema.messages.conversationId, sids))
    await tx.update(schema.comments).set({ conversationId: targetId }).where(inArray(schema.comments.conversationId, sids))
    await tx.update(schema.conversationEvents).set({ conversationId: targetId }).where(inArray(schema.conversationEvents.conversationId, sids))
    await tx.update(schema.tasks).set({ conversationId: targetId }).where(inArray(schema.tasks.conversationId, sids))
    await tx.update(schema.notifications).set({ conversationId: targetId }).where(inArray(schema.notifications.conversationId, sids))
    await tx.execute(sql`
      insert into conversation_assignees (conversation_id, user_id, assigned_by)
      select ${targetId}::uuid, user_id, assigned_by from conversation_assignees where conversation_id in (${sql.join(sids.map((s) => sql`${s}::uuid`), sql`, `)})
      on conflict do nothing`)
    await tx.execute(sql`
      insert into conversation_labels (conversation_id, label_id, added_by)
      select ${targetId}::uuid, label_id, added_by from conversation_labels where conversation_id in (${sql.join(sids.map((s) => sql`${s}::uuid`), sql`, `)})
      on conflict do nothing`)
    await tx.execute(sql`
      insert into conversation_user_state (conversation_id, user_id, starred, following, last_read_at, unread)
      select ${targetId}::uuid, user_id, bool_or(starred), bool_or(following), null, true from conversation_user_state
      where conversation_id in (${sql.join(sids.map((s) => sql`${s}::uuid`), sql`, `)}) group by user_id
      on conflict (conversation_id, user_id) do update set
        starred = conversation_user_state.starred or excluded.starred,
        following = conversation_user_state.following or excluded.following`)
    await tx.update(c).set({ mergedIntoId: targetId }).where(inArray(c.id, sids))
    await addEvent(tx, ctx.org.id, targetId, ctx.user.id, "merged", {
      numbers: sources.map((s) => s.conversation.number),
      subjects: sources.map((s) => displaySubject(s.conversation)),
    })
    await recomputeConversation(targetId, tx)
  })
  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: "conversation.merged",
    targetType: "conversation",
    targetId,
    metadata: { sourceIds: sids },
  })
  await publishConversations(ctx.org.id, [targetId, ...sids], ctx.user.id)
  return { targetId, merged: sids }
}

/* ------------------------------ Hard delete ------------------------------- */

/** Permanently delete trashed conversations (and their stored files). */
export async function deleteConversations(ctx: Ctx, scope: InboxScope, conversationIds: string[]) {
  if (!ctx.permissions.has("conversations.delete")) {
    throw new ApiError(403, "You don't have permission to delete conversations", "forbidden")
  }
  const rows = (await loadAccessible(ctx, scope, conversationIds)).filter(
    (r) => r.conversation.isTrash && r.conversation.kind === "email" && atLeast(r.level, "reply")
  )
  if (!rows.length) throw new ApiError(400, "Only conversations in the trash can be deleted permanently", "not_in_trash")
  const cids = rows.map((r) => r.conversation.id)
  const files = await db
    .select({ id: schema.attachments.id, storageKey: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(
      or(
        sql`${schema.attachments.messageId} in (select id from messages where conversation_id in (${sql.join(cids.map((s) => sql`${s}::uuid`), sql`, `)}))`,
        sql`${schema.attachments.commentId} in (select id from comments where conversation_id in (${sql.join(cids.map((s) => sql`${s}::uuid`), sql`, `)}))`
      )
    )
  await db.transaction(async (tx) => {
    if (files.length) await tx.delete(schema.attachments).where(inArray(schema.attachments.id, files.map((f) => f.id)))
    await tx.delete(c).where(inArray(c.id, cids))
  })
  await deleteUnreferencedObjects(files.map((f) => f.storageKey))
  for (const r of rows) {
    await audit({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: "conversation.deleted",
      targetType: "conversation",
      targetId: r.conversation.id,
      metadata: { number: r.conversation.number, subject: displaySubject(r.conversation) },
    })
  }
  await publishConversations(ctx.org.id, cids, ctx.user.id, "conversation.deleted")
  return { deleted: cids }
}

/** Delete stored files that are no longer referenced by any attachment row. */
export async function deleteUnreferencedObjects(keys: string[]) {
  const unique = [...new Set(keys)]
  if (!unique.length) return
  const still = await db
    .select({ key: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(inArray(schema.attachments.storageKey, unique))
  const referenced = new Set(still.map((s) => s.key))
  for (const key of unique) {
    if (!referenced.has(key)) await deleteObject(key).catch(() => {})
  }
}
