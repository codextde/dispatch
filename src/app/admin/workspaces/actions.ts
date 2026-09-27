"use server"

import { z } from "zod"
import { adminAction } from "@/server/admin/guard"
import { ApiError } from "@/server/api"
import {
  PLANS,
  SUBSCRIPTION_STATUSES,
  deleteWorkspace,
  extendWorkspaceTrial,
  setWorkspacePlan,
  setWorkspaceSubscriptionStatus,
  suspendWorkspace,
  transferWorkspaceOwnership,
  unsuspendWorkspace,
} from "@/server/admin/workspaces"
import { db, schema } from "@/server/db"
import { eq } from "drizzle-orm"

const id = z.uuid("Invalid workspace")

export const setWorkspacePlanAction = adminAction(z.object({ id, plan: z.enum(PLANS) }), async (input, admin) => {
  const res = await setWorkspacePlan(input.id, input.plan)
  await admin.audit("admin.workspace_plan_changed", {
    orgId: input.id,
    targetType: "organization",
    targetId: input.id,
    metadata: { from: res.before, to: res.after },
  })
  return { plan: res.after }
})

export const setWorkspaceStatusAction = adminAction(
  z.object({ id, status: z.enum(SUBSCRIPTION_STATUSES) }),
  async (input, admin) => {
    const res = await setWorkspaceSubscriptionStatus(input.id, input.status)
    await admin.audit("admin.workspace_subscription_status_changed", {
      orgId: input.id,
      targetType: "organization",
      targetId: input.id,
      metadata: { from: res.before, to: res.after },
    })
    return { status: res.after }
  }
)

export const extendWorkspaceTrialAction = adminAction(
  z.object({ id, days: z.coerce.number().int().min(1, "At least 1 day").max(365, "At most 365 days") }),
  async (input, admin) => {
    const res = await extendWorkspaceTrial(input.id, input.days)
    await admin.audit("admin.workspace_trial_extended", {
      orgId: input.id,
      targetType: "organization",
      targetId: input.id,
      metadata: { days: input.days, from: res.before?.toISOString() ?? null, to: res.trialEndsAt.toISOString() },
    })
    return { trialEndsAt: res.trialEndsAt.toISOString(), status: res.subscriptionStatus }
  }
)

export const suspendWorkspaceAction = adminAction(
  z.object({ id, reason: z.string().trim().max(500) }),
  async (input, admin) => {
    const org = await suspendWorkspace(input.id, input.reason)
    await admin.audit("admin.workspace_suspended", {
      orgId: input.id,
      targetType: "organization",
      targetId: input.id,
      metadata: { name: org.name, slug: org.slug, reason: input.reason },
    })
    return { ok: true }
  }
)

export const unsuspendWorkspaceAction = adminAction(z.object({ id }), async (input, admin) => {
  const org = await unsuspendWorkspace(input.id)
  await admin.audit("admin.workspace_unsuspended", {
    orgId: input.id,
    targetType: "organization",
    targetId: input.id,
    metadata: { name: org.name, slug: org.slug, previousReason: org.suspendedReason },
  })
  return { ok: true }
})

export const transferWorkspaceOwnershipAction = adminAction(
  z.object({ id, userId: z.uuid("Choose a member") }),
  async (input, admin) => {
    const res = await transferWorkspaceOwnership(input.id, input.userId)
    await admin.audit("admin.workspace_ownership_transferred", {
      orgId: input.id,
      targetType: "user",
      targetId: input.userId,
      metadata: { workspace: res.org.slug, newOwner: res.newOwnerEmail, previousOwnerIds: res.previousOwnerIds },
    })
    return { ok: true }
  }
)

export const deleteWorkspaceAction = adminAction(
  z.object({ id, confirm: z.string().trim() }),
  async (input, admin) => {
    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, input.id),
      columns: { id: true, name: true, slug: true, plan: true, stripeSubscriptionId: true },
    })
    if (!org) throw new ApiError(404, "Workspace not found")
    if (input.confirm !== org.slug) throw new ApiError(400, `Type “${org.slug}” to confirm.`)
    // Audit first, at instance level, so the entry survives the cascade.
    await admin.audit("admin.workspace_deleted", {
      orgId: null,
      targetType: "organization",
      targetId: org.id,
      metadata: { name: org.name, slug: org.slug, plan: org.plan, stripeSubscriptionId: org.stripeSubscriptionId },
    })
    await deleteWorkspace(org.id)
    return { ok: true }
  }
)
