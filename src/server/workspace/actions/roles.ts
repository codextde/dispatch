"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateWorkspace, workspaceAction } from "@/server/workspace/context"
import { createRole, deleteRole, updateRole } from "@/server/workspace/services/roles"
import { ALL_PERMISSIONS } from "@/lib/permissions"

const slug = z.string().min(1).max(64)
const roleFields = {
  name: z.string().trim().min(1, "Name is required").max(40, "Keep it under 40 characters"),
  description: z.string().trim().max(200, "Keep it under 200 characters").nullish(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a valid color"),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(ALL_PERMISSIONS.length),
}

// Role changes alter permissions of everyone holding the role → refresh the whole workspace shell
async function done(orgId: string, actorId: string) {
  await publish({ orgId, type: "org.updated", actorId })
  revalidateWorkspace()
}

export const createRoleAction = action(z.object({ slug, ...roleFields }), async (input) => {
  const ctx = await workspaceAction(input.slug, "roles.manage")
  const role = await createRole(ctx, input)
  await auditAction(ctx, "role.created", { type: "role", id: role.id }, { name: role.name, permissions: role.permissions })
  await done(ctx.org.id, ctx.user.id)
  return { id: role.id }
})

export const updateRoleAction = action(z.object({ slug, id: z.uuid(), ...roleFields }), async (input) => {
  const ctx = await workspaceAction(input.slug, "roles.manage")
  const { role, added, removed } = await updateRole(ctx, input)
  await auditAction(ctx, "role.updated", { type: "role", id: role.id }, { name: role.name, added, removed })
  await done(ctx.org.id, ctx.user.id)
  return { id: role.id }
})

export const deleteRoleAction = action(
  z.object({ slug, id: z.uuid(), reassignToRoleId: z.uuid().nullish() }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "roles.manage")
    const res = await deleteRole(ctx, input)
    await auditAction(ctx, "role.deleted", { type: "role", id: res.role.id }, {
      name: res.role.name,
      movedTo: res.movedTo ? { id: res.movedTo.id, name: res.movedTo.name } : null,
      members: res.members,
      invitations: res.invitations,
    })
    await done(ctx.org.id, ctx.user.id)
    return { members: res.members, invitations: res.invitations }
  }
)
