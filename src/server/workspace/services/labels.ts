import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { getAccountAccess, visibleConversationsWhere } from "@/server/access"
import { fail } from "@/server/workspace/context"

/**
 * Label management. Shared labels (visibility "shared") need `labels.manage`;
 * private labels belong to one member (ownerUserId) and only they can edit
 * them. Labels nest up to MAX_LABEL_DEPTH levels; siblings are ordered by
 * `position`.
 */

export const MAX_LABEL_DEPTH = 3

export type LabelCtx = Pick<OrgContext, "org" | "user" | "permissions">
export type LabelScope = "shared" | "private"
type LabelRow = typeof schema.labels.$inferSelect

export type LabelInput = {
  name: string
  color: string
  parentId: string | null
  visibility: LabelScope
  showInSidebar: boolean
}

const canManageShared = (ctx: LabelCtx) => ctx.permissions.has("labels.manage")

/** All labels in the scope visible to the member (shared, or own private). */
async function scopeLabels(ctx: LabelCtx, scope: LabelScope): Promise<LabelRow[]> {
  const l = schema.labels
  return db
    .select()
    .from(l)
    .where(
      and(
        eq(l.orgId, ctx.org.id),
        scope === "shared" ? eq(l.visibility, "shared") : and(eq(l.visibility, "private"), eq(l.ownerUserId, ctx.user.id))
      )
    )
}

function assertScopeAccess(ctx: LabelCtx, scope: LabelScope) {
  if (scope === "shared" && !canManageShared(ctx)) fail("You don't have permission to manage workspace labels.", 403)
}

/** Load a label the member may edit (shared + labels.manage, or own private). */
export async function getEditableLabel(ctx: LabelCtx, id: string): Promise<LabelRow> {
  const label = await db.query.labels.findFirst({
    where: and(eq(schema.labels.id, id), eq(schema.labels.orgId, ctx.org.id)),
  })
  if (!label) fail("Label not found.", 404)
  if (label.visibility === "private") {
    if (label.ownerUserId !== ctx.user.id) fail("Label not found.", 404)
  } else assertScopeAccess(ctx, "shared")
  return label
}

function depthOf(id: string, byId: Map<string, LabelRow>): number {
  let depth = 1
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id)
    cur = byId.get(cur.parentId)
    depth++
  }
  return depth
}

function descendantsOf(id: string, all: LabelRow[]): Set<string> {
  const out = new Set<string>()
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    for (const l of all) {
      if (l.parentId === cur && !out.has(l.id)) {
        out.add(l.id)
        queue.push(l.id)
      }
    }
  }
  return out
}

/** Height of the subtree rooted at `id` (a leaf has height 1). */
function subtreeHeight(id: string, all: LabelRow[]): number {
  const children = all.filter((l) => l.parentId === id)
  return 1 + (children.length ? Math.max(...children.map((c) => subtreeHeight(c.id, all))) : 0)
}

function assertUniqueName(name: string, parentId: string | null, siblings: LabelRow[], exceptId?: string) {
  const clash = siblings.find(
    (l) => l.id !== exceptId && (l.parentId ?? null) === parentId && l.name.trim().toLowerCase() === name.trim().toLowerCase()
  )
  if (clash) fail(`A label named “${clash.name}” already exists here.`)
}

/** Validate a parent choice for `labelId` (null for new labels) within a scope. */
function validateParent(parentId: string | null, labelId: string | null, all: LabelRow[]) {
  if (!parentId) return
  const byId = new Map(all.map((l) => [l.id, l]))
  const parent = byId.get(parentId)
  if (!parent) fail("The parent label must be in the same group (workspace or private).")
  if (labelId) {
    if (parentId === labelId) fail("A label can't be nested inside itself.")
    if (descendantsOf(labelId, all).has(parentId)) fail("A label can't be nested inside one of its own sub-labels.")
  }
  const height = labelId ? subtreeHeight(labelId, all) : 1
  if (depthOf(parent.id, byId) + height > MAX_LABEL_DEPTH) {
    fail(`Labels can be nested at most ${MAX_LABEL_DEPTH} levels deep.`)
  }
}

export async function createLabelService(ctx: LabelCtx, input: LabelInput): Promise<LabelRow> {
  assertScopeAccess(ctx, input.visibility)
  const all = await scopeLabels(ctx, input.visibility)
  validateParent(input.parentId, null, all)
  assertUniqueName(input.name, input.parentId, all)
  const siblings = all.filter((l) => (l.parentId ?? null) === input.parentId)
  const position = siblings.length ? Math.max(...siblings.map((l) => l.position)) + 1 : 0
  const [label] = await db
    .insert(schema.labels)
    .values({
      orgId: ctx.org.id,
      name: input.name.trim(),
      color: input.color.toLowerCase(),
      parentId: input.parentId,
      visibility: input.visibility,
      ownerUserId: input.visibility === "private" ? ctx.user.id : null,
      showInSidebar: input.showInSidebar,
      position,
    })
    .returning()
  return label!
}

export async function updateLabelService(
  ctx: LabelCtx,
  id: string,
  input: LabelInput
): Promise<{ label: LabelRow; before: LabelRow; movedDescendants: number }> {
  const before = await getEditableLabel(ctx, id)
  const scopeChanged = before.visibility !== input.visibility
  if (scopeChanged) {
    // Moving between workspace and private always touches a shared label
    assertScopeAccess(ctx, "shared")
    if (before.parentId) fail("Only top-level labels can change visibility. Move it to the top level first.")
    if (input.parentId) fail("Choose no parent when changing a label's visibility.")
  }

  const targetAll = await scopeLabels(ctx, input.visibility)
  // When changing scope, the subtree moves along; validate against the target scope
  const currentAll = scopeChanged ? await scopeLabels(ctx, before.visibility) : targetAll
  const subtree = descendantsOf(id, currentAll)
  if (!scopeChanged) validateParent(input.parentId, id, targetAll)
  assertUniqueName(input.name, input.parentId, targetAll, id)

  const parentChanged = (before.parentId ?? null) !== input.parentId
  let position = before.position
  if (parentChanged || scopeChanged) {
    const siblings = targetAll.filter((l) => (l.parentId ?? null) === input.parentId && l.id !== id)
    position = siblings.length ? Math.max(...siblings.map((l) => l.position)) + 1 : 0
  }

  const label = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.labels)
      .set({
        name: input.name.trim(),
        color: input.color.toLowerCase(),
        parentId: input.parentId,
        visibility: input.visibility,
        ownerUserId: input.visibility === "private" ? ctx.user.id : null,
        showInSidebar: input.showInSidebar,
        position,
      })
      .where(and(eq(schema.labels.id, id), eq(schema.labels.orgId, ctx.org.id)))
      .returning()
    if (scopeChanged && subtree.size) {
      await tx
        .update(schema.labels)
        .set({ visibility: input.visibility, ownerUserId: input.visibility === "private" ? ctx.user.id : null })
        .where(and(eq(schema.labels.orgId, ctx.org.id), inArray(schema.labels.id, [...subtree])))
    }
    return updated!
  })
  return { label, before, movedDescendants: scopeChanged ? subtree.size : 0 }
}

export async function deleteLabelService(ctx: LabelCtx, id: string): Promise<{ label: LabelRow; removedLabels: number }> {
  const label = await getEditableLabel(ctx, id)
  const all = await scopeLabels(ctx, label.visibility)
  const subtree = descendantsOf(id, all)
  // Children cascade via the parent_id foreign key
  await db.delete(schema.labels).where(and(eq(schema.labels.id, id), eq(schema.labels.orgId, ctx.org.id)))
  return { label, removedLabels: 1 + subtree.size }
}

/**
 * Persist a new sibling order. `orderedIds` must be exactly the children of
 * `parentId` in the scope (no more, no less).
 */
export async function reorderLabelsService(
  ctx: LabelCtx,
  input: { scope: LabelScope; parentId: string | null; orderedIds: string[] }
): Promise<void> {
  assertScopeAccess(ctx, input.scope)
  const all = await scopeLabels(ctx, input.scope)
  const siblings = all.filter((l) => (l.parentId ?? null) === input.parentId)
  const ids = new Set(input.orderedIds)
  if (ids.size !== input.orderedIds.length || ids.size !== siblings.length || siblings.some((s) => !ids.has(s.id))) {
    fail("The label list changed in the meantime. Refresh and try again.", 409)
  }
  await db.transaction(async (tx) => {
    for (const [index, labelId] of input.orderedIds.entries()) {
      await tx
        .update(schema.labels)
        .set({ position: index })
        .where(and(eq(schema.labels.id, labelId), eq(schema.labels.orgId, ctx.org.id)))
    }
  })
}

/** Number of conversations each label is applied to, counting only conversations the member can see. */
export async function labelConversationCounts(ctx: LabelCtx, labelIds: string[]): Promise<Map<string, number>> {
  if (!labelIds.length) return new Map()
  const access = await getAccountAccess(ctx)
  const rows = await db
    .select({ labelId: schema.conversationLabels.labelId, count: sql<number>`count(*)::int` })
    .from(schema.conversationLabels)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationLabels.conversationId))
    .where(and(visibleConversationsWhere(ctx, [...access.keys()]), inArray(schema.conversationLabels.labelId, labelIds)))
    .groupBy(schema.conversationLabels.labelId)
  return new Map(rows.map((r) => [r.labelId, Number(r.count)]))
}
