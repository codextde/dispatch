"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { action } from "@/server/action"
import { db, schema } from "@/server/db"
import type { UserPreferences } from "@/server/db/schema"
import { publish } from "@/server/realtime"
import { revokeOtherSessions, revokeSession } from "@/server/auth/session"
import { assertNotImpersonating, auditAction, fail, personalAction, revalidateWorkspace } from "@/server/workspace/context"
import { deleteImageByUrl, imageUrl, storeImage } from "@/server/workspace/uploads"

/**
 * Personal settings: profile, avatar, out-of-office, preferences,
 * notifications and devices. These are user-level and work even while the
 * workspace is read-only.
 */

const slug = z.string().min(1).max(64)

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const timezone = z
  .string()
  .max(64)
  .refine(isValidTimezone, "Unknown timezone")
  .nullable()

async function mergePreferences(userId: string, patch: (prefs: UserPreferences) => UserPreferences) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ preferences: schema.users.preferences })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .for("update")
    const next = patch({ ...(row?.preferences ?? {}) })
    await tx.update(schema.users).set({ preferences: next }).where(eq(schema.users.id, userId))
    return next
  })
}

/* --------------------------------- Profile -------------------------------- */

export const updateProfile = action(
  z.object({
    slug,
    name: z.string().trim().min(1, "Enter your name").max(80, "Keep it under 80 characters"),
    title: z.string().trim().max(80, "Keep it under 80 characters"),
    timezone,
  }),
  async (input) => {
    const ctx = await personalAction(input.slug)
    await db
      .update(schema.users)
      .set({ name: input.name, timezone: input.timezone })
      .where(eq(schema.users.id, ctx.user.id))
    // Job title is per workspace
    await db
      .update(schema.memberships)
      .set({ title: input.title || null })
      .where(and(eq(schema.memberships.id, ctx.membership.id), eq(schema.memberships.orgId, ctx.org.id)))
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return { name: input.name }
  }
)

export const uploadAvatar = action(
  z.object({ slug, file: z.instanceof(File, { message: "Choose an image" }) }),
  async (input) => {
    const ctx = await personalAction(input.slug)
    const key = await storeImage("avatars", ctx.user.id, input.file)
    const url = imageUrl(ctx.org.slug, key)
    const previous = ctx.user.avatarUrl
    await db.update(schema.users).set({ avatarUrl: url }).where(eq(schema.users.id, ctx.user.id))
    await deleteImageByUrl(previous)
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return { avatarUrl: url }
  }
)

export const removeAvatar = action(z.object({ slug }), async (input) => {
  const ctx = await personalAction(input.slug)
  await db.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, ctx.user.id))
  await deleteImageByUrl(ctx.user.avatarUrl)
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
  revalidateWorkspace()
  return { avatarUrl: null }
})

export const updateAway = action(
  z.object({
    slug,
    /** ISO date-time; null turns out-of-office off */
    awayUntil: z.iso.datetime({ offset: true }).nullable(),
    awayMessage: z.string().trim().max(500, "Keep the message under 500 characters"),
  }),
  async (input) => {
    const ctx = await personalAction(input.slug)
    const until = input.awayUntil ? new Date(input.awayUntil) : null
    if (until && until.getTime() <= Date.now()) fail("Pick a date in the future.")
    if (until && until.getTime() > Date.now() + 366 * 86_400_000) fail("Out of office can be set for up to a year.")
    await db
      .update(schema.users)
      .set({ awayUntil: until, awayMessage: until ? input.awayMessage || null : null })
      .where(eq(schema.users.id, ctx.user.id))
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return { awayUntil: until?.toISOString() ?? null }
  }
)

/* ------------------------------- Preferences ------------------------------ */

export const updatePreferences = action(
  z.object({
    slug,
    theme: z.enum(["light", "dark", "system"]),
    density: z.enum(["comfortable", "compact"]),
    shortcuts: z.enum(["dispatch", "gmail", "off"]),
    sendAndArchive: z.boolean(),
    /** null = use the workspace default */
    undoSendSeconds: z.number().int().min(0).max(30).nullable(),
    loadRemoteImages: z.enum(["always", "ask", "never"]),
  }),
  async ({ slug: s, ...prefs }) => {
    const ctx = await personalAction(s)
    const next = await mergePreferences(ctx.user.id, (p) => {
      const out: UserPreferences = { ...p, ...prefs, undoSendSeconds: prefs.undoSendSeconds ?? undefined }
      if (prefs.undoSendSeconds === null) delete out.undoSendSeconds
      return out
    })
    revalidateWorkspace()
    return next
  }
)

export const updateNotificationPreferences = action(
  z.object({
    slug,
    email: z.boolean(),
    desktop: z.boolean(),
    mentions: z.boolean(),
    assignments: z.boolean(),
    newMessages: z.enum(["all", "assigned", "none"]),
  }),
  async ({ slug: s, ...notifications }) => {
    const ctx = await personalAction(s)
    const next = await mergePreferences(ctx.user.id, (p) => ({ ...p, notifications: { ...p.notifications, ...notifications } }))
    revalidateWorkspace()
    return next.notifications ?? {}
  }
)

/* --------------------------------- Devices -------------------------------- */

export const revokeDevice = action(z.object({ slug, sessionId: z.uuid() }), async (input) => {
  const ctx = await personalAction(input.slug)
  assertNotImpersonating(ctx, "sign out devices")
  if (input.sessionId === ctx.session.id) fail("Use “Sign out” to end the current session.")
  await revokeSession(input.sessionId, ctx.user.id)
  await auditAction(ctx, "auth.session_revoked", { type: "session", id: input.sessionId })
  revalidateWorkspace()
  return { revoked: 1 }
})

export const revokeOtherDevices = action(z.object({ slug }), async (input) => {
  const ctx = await personalAction(input.slug)
  assertNotImpersonating(ctx, "sign out devices")
  if (ctx.session.id.startsWith("api:")) fail("Not available for API keys.")
  await revokeOtherSessions(ctx.session.id, ctx.user.id)
  await auditAction(ctx, "auth.sessions_revoked", { type: "user", id: ctx.user.id }, { scope: "others" })
  revalidateWorkspace()
  return { ok: true }
})
