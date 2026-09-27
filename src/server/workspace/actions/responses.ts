"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import {
  createResponseService,
  deleteResponseService,
  scopeOf,
  updateResponseService,
} from "@/server/workspace/services/responses"

const responseFields = {
  name: z.string().trim().min(1, "Name is required").max(80, "Keep it under 80 characters"),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters").nullable(),
  shortcut: z.string().trim().max(40, "Shortcut is too long").nullable(),
  body: z.string().min(1, "The response can't be empty").max(200_000, "The response is too long"),
  scope: z.enum(["personal", "team", "workspace"]),
  teamId: z.uuid().nullable(),
}

export const createResponse = action(z.object({ slug: z.string(), ...responseFields }), async ({ slug, ...input }) => {
  const ctx = await workspaceAction(slug)
  const row = await createResponseService(ctx, input)
  if (input.scope !== "personal") {
    await auditAction(ctx, "response.created", { type: "canned_response", id: row.id }, { name: row.name, scope: input.scope, teamId: row.teamId })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id, data: { resource: "responses" } })
  }
  revalidateSettings()
  return { id: row.id }
})

export const updateResponse = action(
  z.object({ slug: z.string(), id: z.uuid(), ...responseFields }),
  async ({ slug, id, ...input }) => {
    const ctx = await workspaceAction(slug)
    const { row, before } = await updateResponseService(ctx, id, input)
    const wasShared = scopeOf(before) !== "personal"
    if (wasShared || input.scope !== "personal") {
      await auditAction(ctx, "response.updated", { type: "canned_response", id }, {
        name: row.name,
        scope: { from: scopeOf(before), to: input.scope },
      })
      await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id, data: { resource: "responses" } })
    }
    revalidateSettings()
    return { id }
  }
)

export const deleteResponse = action(z.object({ slug: z.string(), id: z.uuid() }), async ({ slug, id }) => {
  const ctx = await workspaceAction(slug)
  const row = await deleteResponseService(ctx, id)
  if (!row.ownerUserId) {
    await auditAction(ctx, "response.deleted", { type: "canned_response", id }, { name: row.name, scope: scopeOf(row) })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id, data: { resource: "responses" } })
  }
  revalidateSettings()
  return { id }
})
