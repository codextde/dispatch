import "server-only"
import { and, asc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { ApiError } from "@/server/api"
import { conversationPrivacy, filterVisibleRecipients, getAccountAccess, getConversationAccess, visibleConversationsWhere } from "@/server/access"
import { publish } from "@/server/realtime"
import { notify } from "@/server/notifications"
import { emitWebhook } from "@/server/jobs"
import { audit } from "@/server/audit"
import type { OrgContext } from "@/server/authz"

/**
 * Tasks: lightweight to-dos for the team, optionally linked to a conversation.
 *
 * Permissions: members with `tasks.manage` create and edit any task they can
 * see. Everyone else can create tasks for themselves and edit tasks assigned
 * to or created by them. Tasks linked to a conversation require access to
 * that conversation; conversation details are only returned to members who
 * can see it.
 */

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">
export type TaskStatus = "todo" | "in_progress" | "done"
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"]

export type TaskDto = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  position: number
  dueAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
  team: { id: string; name: string; color: string } | null
  conversation: { id: string; number: number; subject: string } | null
  createdBy: { id: string; name: string | null; email: string } | null
  canEdit: boolean
}

export const taskFiltersSchema = z.object({
  /** "me" | "anyone" | "unassigned" | "<userId>" */
  assignee: z.string().max(64).optional(),
  /** Comma separated statuses */
  status: z.string().max(64).optional(),
  teamId: z.uuid().optional(),
  conversationId: z.uuid().optional(),
  due: z.enum(["overdue", "today", "week", "upcoming", "none"]).optional(),
  q: z.string().max(200).optional(),
  /** Timezone offset of the client in minutes (Date#getTimezoneOffset) for "today" */
  tz: z.coerce.number().int().min(-900).max(900).optional(),
})
export type TaskFilters = z.infer<typeof taskFiltersSchema>

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().max(20_000).nullish(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assigneeId: z.uuid().nullish(),
  teamId: z.uuid().nullish(),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
  conversationId: z.uuid().nullish(),
  position: z.number().int().min(0).max(1_000_000).optional(),
})
export type TaskInput = z.infer<typeof taskInputSchema>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function startOfDay(tzOffsetMinutes: number, addDays = 0) {
  // Midnight in the client's timezone, expressed in UTC
  const now = new Date(Date.now() - tzOffsetMinutes * 60_000)
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + addDays)
  return new Date(d + tzOffsetMinutes * 60_000)
}

function canManage(ctx: Ctx) {
  return ctx.permissions.has("tasks.manage")
}

function canEditTask(ctx: Ctx, t: { assigneeId: string | null; createdBy: string | null }) {
  return canManage(ctx) || t.assigneeId === ctx.user.id || t.createdBy === ctx.user.id
}

async function assertMember(orgId: string, userId: string) {
  const m = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")),
    columns: { id: true },
  })
  if (!m) throw new ApiError(400, "Assignee is not a member of this workspace", "validation_error")
}

async function assertTeam(orgId: string, teamId: string) {
  const t = await db.query.teams.findFirst({
    where: and(eq(schema.teams.orgId, orgId), eq(schema.teams.id, teamId)),
    columns: { id: true },
  })
  if (!t) throw new ApiError(400, "Team not found", "validation_error")
}

/** A task row the member can see (null otherwise): the same rule as `getTask` and `listTasks`. */
async function loadVisibleTask(ctx: Ctx, id: string) {
  if (!UUID_RE.test(id)) return null
  const access = await getAccountAccess(ctx)
  const visibleConv = visibleConversationsWhere(ctx, [...access.keys()])
  const [row] = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.orgId, ctx.org.id), eq(schema.tasks.id, id), taskAccessWhere(ctx, visibleConv)))
    .limit(1)
  return row ?? null
}

async function assertConversation(ctx: Ctx, conversationId: string) {
  const access = await getConversationAccess(ctx, conversationId)
  if (!access) throw new ApiError(404, "Conversation not found", "not_found")
  return access.conversation
}

/* -------------------------------------------------------------------------- */
/*                                   Queries                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tasks a member may see: their own (assigned or created) and tasks linked to
 * conversations they can see. With `tasks.manage` also every task that isn't
 * linked to a conversation. Linked tasks never reveal hidden conversations.
 */
function taskAccessWhere(ctx: Ctx, visibleConv: SQL): SQL {
  const t = schema.tasks
  const me = ctx.user.id
  return or(
    eq(t.assigneeId, me),
    eq(t.createdBy, me),
    canManage(ctx) ? isNull(t.conversationId) : sql`false`,
    sql`exists (select 1 from ${schema.conversations} where ${schema.conversations.id} = ${t.conversationId} and ${visibleConv})`
  )!
}

export async function listTasks(ctx: Ctx, filters: TaskFilters = {}): Promise<TaskDto[]> {
  const t = schema.tasks
  const conds: SQL[] = [eq(t.orgId, ctx.org.id)]
  const me = ctx.user.id

  if (filters.assignee === "me") conds.push(eq(t.assigneeId, me))
  else if (filters.assignee === "unassigned") conds.push(isNull(t.assigneeId))
  else if (filters.assignee && UUID_RE.test(filters.assignee)) conds.push(eq(t.assigneeId, filters.assignee))

  const statuses = (filters.status ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TaskStatus => (TASK_STATUSES as string[]).includes(s))
  if (statuses.length) conds.push(inArray(t.status, statuses))
  if (filters.teamId) conds.push(eq(t.teamId, filters.teamId))
  if (filters.conversationId) conds.push(eq(t.conversationId, filters.conversationId))
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    conds.push(or(ilike(t.title, like), ilike(t.description, like))!)
  }
  const tz = filters.tz ?? 0
  const today = startOfDay(tz)
  const tomorrow = startOfDay(tz, 1)
  if (filters.due === "overdue") conds.push(and(lt(t.dueAt, today), sql`${t.status} <> 'done'`)!)
  else if (filters.due === "today") conds.push(and(gte(t.dueAt, today), lt(t.dueAt, tomorrow))!)
  else if (filters.due === "week") conds.push(and(isNotNull(t.dueAt), lt(t.dueAt, startOfDay(tz, 7)))!)
  else if (filters.due === "upcoming") conds.push(gte(t.dueAt, tomorrow))
  else if (filters.due === "none") conds.push(isNull(t.dueAt))

  const access = await getAccountAccess(ctx)
  const visibleConv = visibleConversationsWhere(ctx, [...access.keys()])
  conds.push(taskAccessWhere(ctx, visibleConv))

  const rows = await db
    .select({
      task: t,
      assignee: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      },
      team: { id: schema.teams.id, name: schema.teams.name, color: schema.teams.color },
    })
    .from(t)
    .leftJoin(schema.users, eq(schema.users.id, t.assigneeId))
    .leftJoin(schema.teams, eq(schema.teams.id, t.teamId))
    .where(and(...conds))
    .orderBy(
      sql`case ${t.status} when 'todo' then 0 when 'in_progress' then 1 else 2 end`,
      asc(t.position),
      sql`${t.dueAt} asc nulls last`,
      sql`${t.createdAt} desc`
    )
    .limit(1000)

  return hydrate(ctx, rows, visibleConv)
}

type Row = {
  task: typeof schema.tasks.$inferSelect
  assignee: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
  team: { id: string; name: string; color: string } | null
}

async function hydrate(ctx: Ctx, rows: Row[], visibleConv?: SQL): Promise<TaskDto[]> {
  const convIds = [...new Set(rows.map((r) => r.task.conversationId).filter((x): x is string => Boolean(x)))]
  const creatorIds = [...new Set(rows.map((r) => r.task.createdBy).filter((x): x is string => Boolean(x)))]
  let visible = visibleConv
  if (!visible && convIds.length) {
    const access = await getAccountAccess(ctx)
    visible = visibleConversationsWhere(ctx, [...access.keys()])
  }
  const [convs, creators] = await Promise.all([
    convIds.length
      ? db
          .select({
            id: schema.conversations.id,
            number: schema.conversations.number,
            subject: schema.conversations.subject,
            customSubject: schema.conversations.customSubject,
          })
          .from(schema.conversations)
          .where(and(inArray(schema.conversations.id, convIds), visible))
      : Promise.resolve([]),
    creatorIds.length
      ? db
          .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, creatorIds))
      : Promise.resolve([]),
  ])
  const convMap = new Map(convs.map((c) => [c.id, { id: c.id, number: c.number, subject: c.customSubject || c.subject }]))
  const creatorMap = new Map(creators.map((c) => [c.id, c]))
  return rows.map(({ task, assignee, team }) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    position: task.position,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignee: assignee?.id ? assignee : null,
    team: team?.id ? team : null,
    conversation: task.conversationId ? (convMap.get(task.conversationId) ?? null) : null,
    createdBy: task.createdBy ? (creatorMap.get(task.createdBy) ?? null) : null,
    canEdit: canEditTask(ctx, task),
  }))
}

/** Load one task as the member sees it (null when it isn't visible to them). */
export async function getTask(ctx: Ctx, id: string): Promise<TaskDto | null> {
  if (!UUID_RE.test(id)) return null
  const access = await getAccountAccess(ctx)
  const visibleConv = visibleConversationsWhere(ctx, [...access.keys()])
  return taskDto(ctx, and(eq(schema.tasks.id, id), taskAccessWhere(ctx, visibleConv))!, visibleConv)
}

/** DTO of the task matching `where` in this workspace; hidden conversation details stay hidden. */
async function taskDto(ctx: Ctx, where: SQL, visibleConv?: SQL): Promise<TaskDto | null> {
  const rows = await db
    .select({
      task: schema.tasks,
      assignee: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      },
      team: { id: schema.teams.id, name: schema.teams.name, color: schema.teams.color },
    })
    .from(schema.tasks)
    .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
    .leftJoin(schema.teams, eq(schema.teams.id, schema.tasks.teamId))
    .where(and(eq(schema.tasks.orgId, ctx.org.id), where))
    .limit(1)
  if (!rows.length) return null
  const [dto] = await hydrate(ctx, rows, visibleConv)
  return dto!
}

/** Assignable members and teams for the task pickers. */
export async function taskOptions(ctx: Ctx) {
  const [members, teams] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.status, "active")))
      .orderBy(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`),
    db
      .select({ id: schema.teams.id, name: schema.teams.name, color: schema.teams.color })
      .from(schema.teams)
      .where(eq(schema.teams.orgId, ctx.org.id))
      .orderBy(schema.teams.name),
  ])
  return { members, teams, canManage: canManage(ctx) }
}

/* -------------------------------------------------------------------------- */
/*                                  Mutations                                 */
/* -------------------------------------------------------------------------- */

function actorName(ctx: Pick<OrgContext, "user">) {
  return ctx.user.name || ctx.user.email
}

type TaskRow = typeof schema.tasks.$inferSelect

async function notifyAssignee(ctx: Ctx & Pick<OrgContext, "user">, row: TaskRow) {
  if (!row.assigneeId || row.assigneeId === ctx.user.id) return
  // The task is theirs either way; the linked conversation only if they can see it.
  const seesConversation = row.conversationId
    ? (await filterVisibleRecipients(ctx.org.id, row.conversationId, [row.assigneeId])).length > 0
    : false
  await notify({
    orgId: ctx.org.id,
    userIds: [row.assigneeId],
    type: "task",
    title: `${actorName(ctx)} assigned you a task`,
    body: row.title,
    actorId: ctx.user.id,
    conversationId: seesConversation ? row.conversationId : null,
    data: { taskId: row.id, dueAt: row.dueAt?.toISOString() ?? null },
  })
}

/** Webhook payloads are built from the stored task, independent of who triggered the event. */
function webhookPayload(row: TaskRow) {
  return {
    task: {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      dueAt: row.dueAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      assigneeId: row.assigneeId,
      teamId: row.teamId,
      conversationId: row.conversationId,
      createdBy: row.createdBy,
    },
  }
}

/**
 * Realtime event for a task. Tasks on a private conversation (personal inbox)
 * are only announced to the inbox owner and the task's assignee and creator.
 */
async function publishTask(ctx: Ctx, row: Pick<TaskRow, "id" | "conversationId" | "assigneeId" | "createdBy">, data: Record<string, unknown> = {}) {
  let userIds: string[] | undefined
  if (row.conversationId) {
    const privacy = await conversationPrivacy(ctx.org.id, row.conversationId)
    if (!privacy.shared) {
      userIds = [...new Set([privacy.ownerUserId, row.assigneeId, row.createdBy, ctx.user.id].filter((u): u is string => Boolean(u)))]
    }
  }
  await publish({ orgId: ctx.org.id, type: "task.updated", actorId: ctx.user.id, userIds, data: { taskId: row.id, ...data } })
}

export async function createTask(ctx: Ctx, input: TaskInput): Promise<TaskDto> {
  let assigneeId = input.assigneeId ?? null
  if (!canManage(ctx)) {
    // Without tasks.manage members can only create tasks for themselves
    if (assigneeId && assigneeId !== ctx.user.id) throw new ApiError(403, "You can only assign tasks to yourself", "forbidden")
    assigneeId = ctx.user.id
  }
  if (assigneeId) await assertMember(ctx.org.id, assigneeId)
  if (input.teamId) await assertTeam(ctx.org.id, input.teamId)
  if (input.conversationId) await assertConversation(ctx, input.conversationId)
  const status = input.status ?? "todo"

  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.tasks.position}) + 1, 0)::int` })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.orgId, ctx.org.id), eq(schema.tasks.status, status)))

  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: ctx.org.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      assigneeId,
      teamId: input.teamId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      conversationId: input.conversationId ?? null,
      completedAt: status === "done" ? new Date() : null,
      position: input.position ?? next,
      createdBy: ctx.user.id,
    })
    .returning()
  const task = (await getTask(ctx, row!.id))!

  await publishTask(ctx, row!)
  await notifyAssignee(ctx as Ctx & Pick<OrgContext, "user">, row!)
  await emitWebhook(ctx.org.id, "task.created", webhookPayload(row!), { conversationId: row!.conversationId })
  if (status === "done") await emitWebhook(ctx.org.id, "task.completed", webhookPayload(row!), { conversationId: row!.conversationId })
  return task
}

export async function updateTask(ctx: Ctx, id: string, input: Partial<TaskInput>): Promise<TaskDto> {
  const existing = await loadVisibleTask(ctx, id)
  if (!existing) throw new ApiError(404, "Task not found", "not_found")
  if (!canEditTask(ctx, existing)) throw new ApiError(403, "You can't edit this task", "forbidden")

  const patch: Partial<typeof schema.tasks.$inferInsert> = {}
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
    if (!canManage(ctx) && input.assigneeId && input.assigneeId !== ctx.user.id) {
      throw new ApiError(403, "You can only assign tasks to yourself", "forbidden")
    }
    if (input.assigneeId) await assertMember(ctx.org.id, input.assigneeId)
    patch.assigneeId = input.assigneeId ?? null
  }
  if (input.teamId !== undefined) {
    if (input.teamId) await assertTeam(ctx.org.id, input.teamId)
    patch.teamId = input.teamId ?? null
  }
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null
  if (input.conversationId !== undefined && input.conversationId !== existing.conversationId) {
    if (input.conversationId) await assertConversation(ctx, input.conversationId)
    patch.conversationId = input.conversationId ?? null
  }
  if (input.status !== undefined && input.status !== existing.status) {
    patch.status = input.status
    patch.completedAt = input.status === "done" ? new Date() : null
    if (input.position === undefined) {
      const [{ next } = { next: 0 }] = await db
        .select({ next: sql<number>`coalesce(max(${schema.tasks.position}) + 1, 0)::int` })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.orgId, ctx.org.id), eq(schema.tasks.status, input.status)))
      patch.position = next
    }
  }
  if (input.position !== undefined) patch.position = input.position

  const [row] = Object.keys(patch).length
    ? await db.update(schema.tasks).set(patch).where(and(eq(schema.tasks.orgId, ctx.org.id), eq(schema.tasks.id, id))).returning()
    : [existing]
  // The member could see and edit the task a moment ago; after unassigning themselves they may not anymore.
  const task = (await taskDto(ctx, eq(schema.tasks.id, id)))!

  await publishTask(ctx, row!)
  // Moved away from a private conversation: its old audience learns that the task left.
  if (existing.conversationId && existing.conversationId !== row!.conversationId) await publishTask(ctx, existing)
  if (patch.assigneeId) await notifyAssignee(ctx as Ctx & Pick<OrgContext, "user">, row!)
  if (patch.status === "done") await emitWebhook(ctx.org.id, "task.completed", webhookPayload(row!), { conversationId: row!.conversationId })
  return task
}

export async function deleteTask(ctx: Ctx & Pick<OrgContext, "user">, id: string) {
  const existing = await loadVisibleTask(ctx, id)
  if (!existing) throw new ApiError(404, "Task not found", "not_found")
  if (!canEditTask(ctx, existing)) throw new ApiError(403, "You can't delete this task", "forbidden")
  await db.delete(schema.tasks).where(and(eq(schema.tasks.orgId, ctx.org.id), eq(schema.tasks.id, id)))
  await publishTask(ctx, existing, { deleted: true })
  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: "task.deleted",
    targetType: "task",
    targetId: id,
    metadata: { title: existing.title },
  })
}

/**
 * Persist the order of a board column: `ids` become `status` with positions
 * 0..n in the given order. Tasks the member can't see or edit are ignored.
 */
export async function reorderTasks(ctx: Ctx & Pick<OrgContext, "user">, status: TaskStatus, ids: string[]) {
  const unique = [...new Set(ids.filter((id) => UUID_RE.test(id)))].slice(0, 1000)
  if (!unique.length) return
  const access = await getAccountAccess(ctx)
  const visibleConv = visibleConversationsWhere(ctx, [...access.keys()])
  const rows = await db
    .select({ id: schema.tasks.id, status: schema.tasks.status, assigneeId: schema.tasks.assigneeId, createdBy: schema.tasks.createdBy })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.orgId, ctx.org.id), inArray(schema.tasks.id, unique), taskAccessWhere(ctx, visibleConv)))
  const editable = new Map(rows.filter((r) => canEditTask(ctx, r)).map((r) => [r.id, r]))
  const completed: string[] = []
  await db.transaction(async (tx) => {
    let position = 0
    for (const id of unique) {
      const row = editable.get(id)
      if (!row) continue
      const statusChanged = row.status !== status
      if (statusChanged && status === "done") completed.push(id)
      await tx
        .update(schema.tasks)
        .set({
          position: position++,
          ...(statusChanged ? { status, completedAt: status === "done" ? new Date() : null } : {}),
        })
        .where(eq(schema.tasks.id, id))
    }
  })
  await publish({ orgId: ctx.org.id, type: "task.updated", actorId: ctx.user.id, data: { reordered: status } })
  if (completed.length) {
    const done = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.orgId, ctx.org.id), inArray(schema.tasks.id, completed)))
    for (const row of done) await emitWebhook(ctx.org.id, "task.completed", webhookPayload(row), { conversationId: row.conversationId })
  }
}
