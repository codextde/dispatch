"use server"

import { z } from "zod"
import { adminAction } from "@/server/admin/guard"
import { ApiError } from "@/server/api"
import {
  deleteUser,
  revokeAllUserSessions,
  revokeUserSession,
  setUserStatus,
  setUserSuperAdmin,
  userDeletionBlockers,
} from "@/server/admin/users"

const id = z.uuid("Invalid user")

export const setSuperAdminAction = adminAction(z.object({ id, value: z.boolean() }), async (input, admin) => {
  const user = await setUserSuperAdmin(admin.user.id, input.id, input.value)
  await admin.audit(input.value ? "admin.super_admin_granted" : "admin.super_admin_revoked", {
    targetType: "user",
    targetId: user.id,
    metadata: { email: user.email },
  })
  return { isSuperAdmin: user.isSuperAdmin }
})

export const setUserStatusAction = adminAction(
  z.object({ id, status: z.enum(["active", "disabled"]) }),
  async (input, admin) => {
    const res = await setUserStatus(admin.user.id, input.id, input.status)
    await admin.audit(input.status === "disabled" ? "admin.user_disabled" : "admin.user_enabled", {
      targetType: "user",
      targetId: res.user.id,
      metadata: { email: res.user.email, revokedSessions: res.revokedSessions },
    })
    return { status: res.user.status, revokedSessions: res.revokedSessions }
  }
)

export const revokeUserSessionAction = adminAction(z.object({ userId: id, sessionId: z.uuid() }), async (input, admin) => {
  const session = await revokeUserSession(input.userId, input.sessionId, admin.session.id)
  await admin.audit("admin.session_revoked", {
    targetType: "user",
    targetId: input.userId,
    metadata: { sessionId: session.id, device: session.deviceLabel },
  })
  return { ok: true }
})

export const revokeAllUserSessionsAction = adminAction(z.object({ userId: id }), async (input, admin) => {
  const count = await revokeAllUserSessions(input.userId, { userId: admin.user.id, sessionId: admin.session.id })
  await admin.audit("admin.sessions_revoked", {
    targetType: "user",
    targetId: input.userId,
    metadata: { count, keptCurrent: input.userId === admin.user.id },
  })
  return { count }
})

export const deleteUserAction = adminAction(z.object({ id, confirm: z.string().trim() }), async (input, admin) => {
  const check = await userDeletionBlockers(admin.user.id, input.id)
  if (!check.target) throw new ApiError(404, "User not found")
  if (input.confirm.toLowerCase() !== check.target.email.toLowerCase()) {
    throw new ApiError(400, `Type “${check.target.email}” to confirm.`)
  }
  if (check.reason) {
    const names = check.soleOwned.map((w) => w.name).join(", ")
    throw new ApiError(400, names ? `${check.reason} (${names})` : check.reason)
  }
  // Audit first at instance level (no FK to the user) so the entry survives.
  await admin.audit("admin.user_deleted", {
    targetType: "user",
    targetId: check.target.id,
    metadata: { email: check.target.email, name: check.target.name, wasSuperAdmin: check.target.isSuperAdmin },
  })
  await deleteUser(admin.user.id, input.id)
  return { ok: true }
})
