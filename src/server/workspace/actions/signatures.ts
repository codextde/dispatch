"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import {
  createSignatureService,
  deleteSignatureService,
  updateSignatureService,
} from "@/server/workspace/services/signatures"

const signatureFields = {
  name: z.string().trim().min(1, "Name is required").max(80, "Keep it under 80 characters"),
  body: z.string().min(1, "The signature can't be empty").max(100_000, "The signature is too long"),
  scope: z.enum(["personal", "workspace"]),
  accountIds: z.array(z.uuid()).max(200),
}

export const createSignature = action(z.object({ slug: z.string(), ...signatureFields }), async ({ slug, ...input }) => {
  const ctx = await workspaceAction(slug)
  const row = await createSignatureService(ctx, input)
  if (input.scope === "workspace") {
    await auditAction(ctx, "signature.created", { type: "signature", id: row.id }, { name: row.name, accountIds: input.accountIds })
  }
  if (input.accountIds.length) await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id })
  revalidateSettings()
  return { id: row.id }
})

export const updateSignature = action(
  z.object({ slug: z.string(), id: z.uuid(), ...signatureFields }),
  async ({ slug, id, ...input }) => {
    const ctx = await workspaceAction(slug)
    const { row, before, previousAccountIds } = await updateSignatureService(ctx, id, input)
    const assignmentChanged =
      previousAccountIds.length !== input.accountIds.length || previousAccountIds.some((a) => !input.accountIds.includes(a))
    if (input.scope === "workspace" || !before.ownerUserId) {
      await auditAction(ctx, "signature.updated", { type: "signature", id }, { name: row.name, scope: input.scope })
      if (assignmentChanged) {
        await auditAction(ctx, "signature.assigned", { type: "signature", id }, {
          name: row.name,
          from: previousAccountIds,
          to: input.accountIds,
        })
      }
    }
    if (assignmentChanged) await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id })
    revalidateSettings()
    return { id }
  }
)

export const deleteSignature = action(z.object({ slug: z.string(), id: z.uuid() }), async ({ slug, id }) => {
  const ctx = await workspaceAction(slug)
  const row = await deleteSignatureService(ctx, id)
  if (!row.ownerUserId) await auditAction(ctx, "signature.deleted", { type: "signature", id }, { name: row.name })
  await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id })
  revalidateSettings()
  return { id }
})
