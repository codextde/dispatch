"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import {
  createLabelService,
  deleteLabelService,
  reorderLabelsService,
  updateLabelService,
} from "@/server/workspace/services/labels"

const labelFields = {
  name: z.string().trim().min(1, "Name is required").max(60, "Keep it under 60 characters"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a valid color"),
  parentId: z.uuid().nullable(),
  visibility: z.enum(["shared", "private"]),
  showInSidebar: z.boolean(),
}

export const createLabel = action(z.object({ slug: z.string(), ...labelFields }), async ({ slug, ...input }) => {
  const ctx = await workspaceAction(slug)
  const label = await createLabelService(ctx, input)
  if (label.visibility === "shared") {
    await auditAction(ctx, "label.created", { type: "label", id: label.id }, { name: label.name, parentId: label.parentId })
  }
  await publish({ orgId: ctx.org.id, type: "labels.updated", actorId: ctx.user.id })
  revalidateSettings()
  return { id: label.id }
})

export const updateLabel = action(
  z.object({ slug: z.string(), id: z.uuid(), ...labelFields }),
  async ({ slug, id, ...input }) => {
    const ctx = await workspaceAction(slug)
    const { label, before, movedDescendants } = await updateLabelService(ctx, id, input)
    if (label.visibility === "shared" || before.visibility === "shared") {
      const changes: Record<string, unknown> = {}
      for (const key of ["name", "color", "parentId", "visibility", "showInSidebar"] as const) {
        if (before[key] !== label[key]) changes[key] = { from: before[key], to: label[key] }
      }
      await auditAction(ctx, "label.updated", { type: "label", id }, { name: label.name, changes, movedDescendants })
    }
    await publish({ orgId: ctx.org.id, type: "labels.updated", actorId: ctx.user.id })
    revalidateSettings()
    return { id }
  }
)

export const deleteLabel = action(z.object({ slug: z.string(), id: z.uuid() }), async ({ slug, id }) => {
  const ctx = await workspaceAction(slug)
  const { label, removedLabels } = await deleteLabelService(ctx, id)
  if (label.visibility === "shared") {
    await auditAction(ctx, "label.deleted", { type: "label", id }, { name: label.name, removedLabels })
  }
  await publish({ orgId: ctx.org.id, type: "labels.updated", actorId: ctx.user.id })
  revalidateSettings()
  return { removedLabels }
})

export const reorderLabels = action(
  z.object({
    slug: z.string(),
    scope: z.enum(["shared", "private"]),
    parentId: z.uuid().nullable(),
    orderedIds: z.array(z.uuid()).min(1).max(500),
  }),
  async ({ slug, ...input }) => {
    const ctx = await workspaceAction(slug)
    await reorderLabelsService(ctx, input)
    if (input.scope === "shared") {
      await auditAction(ctx, "label.reordered", null, { parentId: input.parentId, count: input.orderedIds.length })
    }
    await publish({ orgId: ctx.org.id, type: "labels.updated", actorId: ctx.user.id })
    revalidateSettings()
    return { ok: true }
  }
)
