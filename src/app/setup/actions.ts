"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { ApiError } from "@/server/api"
import { audit } from "@/server/audit"
import { emailSchema } from "@/server/auth/magic-link"
import { rateLimit } from "@/server/rate-limit"
import { getRequestMeta } from "@/server/request"
import { emailConfigInput, saveSettingsSection, settingsInputSchemas } from "@/server/admin/settings"
import {
  SetupError,
  checkSlugAvailability,
  completeSetup,
  createFirstSuperAdmin,
  createWorkspaceFor,
  getSetupStatus,
  loadDemoData,
  requireSetupActor,
  verifySetupCode,
} from "@/server/setup"
import { establishSession } from "@/app/login/complete-login"

async function auditSetup(userId: string, email: string, actionName: string, metadata: Record<string, unknown> = {}) {
  const meta = await getRequestMeta()
  await audit({ actorId: userId, actorEmail: email, action: actionName, ip: meta.ip, userAgent: meta.userAgent, metadata })
}

const SETUP_CODE_ERRORS = {
  missing: "Enter the setup code from the server logs.",
  invalid: "That setup code isn't right. Check the server logs for the current code.",
  rate_limited: "Too many attempts. Please try again in an hour.",
} as const

/**
 * Step 2 — create the instance owner (first super admin) and sign them in on
 * this device. Requires the one-time setup code from the server logs and is
 * only possible while no super admin exists.
 */
export const createOwnerAction = action(
  z.object({
    setupCode: z.string().max(40).optional(),
    name: z.string().trim().min(1, "Enter your name").max(80),
    email: emailSchema,
  }),
  async ({ setupCode, name, email }) => {
    const status = await getSetupStatus()
    if (status.completed) throw new ApiError(403, "Setup has already been completed.")
    if (status.hasSuperAdmin) throw new ApiError(409, "An instance owner already exists. Sign in to continue setup.")
    const meta = await getRequestMeta()
    const code = await verifySetupCode(setupCode, meta.ip)
    if (!code.ok) {
      await audit({ action: "setup.code_rejected", actorEmail: email, ip: meta.ip, userAgent: meta.userAgent, metadata: { reason: code.reason } })
      throw new ApiError(code.reason === "rate_limited" ? 429 : 403, SETUP_CODE_ERRORS[code.reason])
    }
    const limit = await rateLimit(`setup:owner:${meta.ip ?? "unknown"}`, 20, 3600)
    if (!limit.ok) throw new ApiError(429, "Too many attempts. Please try again later.")

    let user
    try {
      user = await createFirstSuperAdmin({ name, email })
    } catch (err) {
      if (err instanceof SetupError) throw new ApiError(409, err.message)
      throw err
    }
    await auditSetup(user.id, user.email, "setup.owner_created", { via: "setup" })
    await establishSession({ userId: user.id, email: user.email, method: "setup", isNewUser: true, redirectTo: "/setup" })
    return { name: user.name ?? name, email: user.email }
  }
)

/** Step 3 — instance name, mode and sign-up policy. */
export const saveInstanceAction = action(
  z.object({
    general: settingsInputSchemas.general,
    auth: settingsInputSchemas.auth,
  }),
  async (input) => {
    const s = await requireSetupActor()
    // auth first: it has cross-field rules (e.g. allowed domains) that may reject the step
    const auth = await saveSettingsSection("auth", input.auth, undefined, s.user.id)
    const general = await saveSettingsSection("general", input.general, undefined, s.user.id)
    await auditSetup(s.user.id, s.user.email, "admin.settings_updated", { section: "general", fields: general.changed, via: "setup" })
    await auditSetup(s.user.id, s.user.email, "admin.settings_updated", { section: "auth", fields: auth.changed, via: "setup" })
    return { ok: true }
  }
)

/** Step 4 — email delivery (or "skip": provider log). */
export const saveEmailSetupAction = action(
  z.object({
    values: emailConfigInput,
    /** New SMTP password; omit to keep the stored one */
    password: z.string().max(4000).optional(),
  }),
  async ({ values, password }) => {
    const s = await requireSetupActor()
    const res = await saveSettingsSection(
      "email",
      values,
      password !== undefined ? { passwordEnc: password } : undefined,
      s.user.id
    )
    await auditSetup(s.user.id, s.user.email, "admin.settings_updated", {
      section: "email",
      fields: res.changed,
      secrets: res.secretsChanged,
      via: "setup",
    })
    return { passwordPreview: (res.settings as { passwordEnc?: string }).passwordEnc ?? "" }
  }
)

export const checkSetupSlugAction = action(z.object({ slug: z.string().max(80) }), async ({ slug }) => {
  await requireSetupActor()
  return checkSlugAvailability(slug)
})

/** Step 5 — first workspace (+ optional demo data), then mark setup complete. */
export const finishSetupAction = action(
  z.object({
    name: z.string().trim().min(1, "Name your workspace").max(80),
    slug: z.string().trim().max(60).optional(),
    demo: z.boolean(),
  }),
  async ({ name, slug, demo }) => {
    const s = await requireSetupActor()
    const org = await createWorkspaceFor({ userId: s.user.id, name, slug, onboarded: true })
    const demoResult = demo ? await loadDemoData(org.id, s.user.id) : null
    await completeSetup(s.user.id)
    await auditSetup(s.user.id, s.user.email, "setup.completed", { workspaceId: org.id, slug: org.slug, demo })
    return {
      path: `/w/${org.slug}/inbox`,
      demoError: demoResult && !demoResult.ok ? demoResult.error : null,
    }
  }
)
