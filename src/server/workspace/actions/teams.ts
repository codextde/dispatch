"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { publish } from "@/server/realtime"
import { auditAction, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import {
  addTeamMembers,
  ASSIGNMENT_STRATEGIES,
  createTeam,
  deleteTeam,
  removeTeamMember,
  setTeamLead,
  updateTeam,
} from "@/server/workspace/services/teams"

const slug = z.string().min(1).max(64)
const teamFields = {
  name: z.string().trim().min(1, "Name is required").max(60, "Keep it under 60 characters"),
  description: z.string().trim().max(280, "Keep it under 280 characters").nullish(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a valid color"),
  assignmentStrategy: z.enum(ASSIGNMENT_STRATEGIES),
}

async function done(orgId: string, actorId: string) {
  await publish({ orgId, type: "org.updated", actorId })
  revalidateSettings()
}

export const createTeamAction = action(
  z.object({
    slug,
    ...teamFields,
    memberIds: z.array(z.uuid()).max(500).default([]),
    leadIds: z.array(z.uuid()).max(500).default([]),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "teams.manage")
    const { team, memberIds } = await createTeam(ctx, input)
    await auditAction(ctx, "team.created", { type: "team", id: team.id }, {
      name: team.name,
      assignmentStrategy: team.assignmentStrategy,
      members: memberIds.length,
    })
    await done(ctx.org.id, ctx.user.id)
    return { id: team.id }
  }
)

export const updateTeamAction = action(z.object({ slug, id: z.uuid(), ...teamFields }), async (input) => {
  const ctx = await workspaceAction(input.slug, "teams.manage")
  const { team, changes } = await updateTeam(ctx, input)
  if (Object.keys(changes).length) {
    await auditAction(ctx, "team.updated", { type: "team", id: team.id }, { name: team.name, changes })
    await done(ctx.org.id, ctx.user.id)
  }
  return { id: team.id }
})

export const deleteTeamAction = action(z.object({ slug, id: z.uuid() }), async (input) => {
  const ctx = await workspaceAction(input.slug, "teams.manage")
  const team = await deleteTeam(ctx, input.id)
  await auditAction(ctx, "team.deleted", { type: "team", id: team.id }, { name: team.name })
  await done(ctx.org.id, ctx.user.id)
  return { id: team.id }
})

export const addTeamMembersAction = action(
  z.object({ slug, teamId: z.uuid(), userIds: z.array(z.uuid()).min(1, "Choose at least one member").max(500) }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "teams.manage")
    const { team, added } = await addTeamMembers(ctx, input)
    for (const userId of added) {
      await auditAction(ctx, "team.member_added", { type: "team", id: team.id }, { team: team.name, userId })
    }
    if (added.length) await done(ctx.org.id, ctx.user.id)
    return { added: added.length }
  }
)

export const removeTeamMemberAction = action(z.object({ slug, teamId: z.uuid(), userId: z.uuid() }), async (input) => {
  const ctx = await workspaceAction(input.slug, "teams.manage")
  const { team } = await removeTeamMember(ctx, input)
  await auditAction(ctx, "team.member_removed", { type: "team", id: team.id }, { team: team.name, userId: input.userId })
  await done(ctx.org.id, ctx.user.id)
  return { ok: true }
})

export const setTeamLeadAction = action(
  z.object({ slug, teamId: z.uuid(), userId: z.uuid(), isLead: z.boolean() }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "teams.manage")
    const { team } = await setTeamLead(ctx, input)
    await auditAction(ctx, "team.lead_changed", { type: "team", id: team.id }, {
      team: team.name,
      userId: input.userId,
      isLead: input.isLead,
    })
    await done(ctx.org.id, ctx.user.id)
    return { ok: true }
  }
)
