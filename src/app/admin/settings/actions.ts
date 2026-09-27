"use server"

import { z } from "zod"
import { adminAction } from "@/server/admin/guard"
import { EDITABLE_SECTIONS, emailConfigInput, saveSettingsSection } from "@/server/admin/settings"
import { sendTestEmail } from "@/server/admin/email-test"
import { testAiProvider } from "@/server/admin/ai-test"
import { testStorage } from "@/server/storage"
import { getSettings } from "@/server/settings"
import { ApiError } from "@/server/api"

/** Save one instance settings section. Secrets are only sent when a new value was entered. */
export const saveSettingsAction = adminAction(
  z.object({
    section: z.enum(EDITABLE_SECTIONS),
    values: z.record(z.string(), z.unknown()),
    secrets: z.record(z.string(), z.string()).optional(),
  }),
  async (input, admin) => {
    const res = await saveSettingsSection(input.section, input.values, input.secrets, admin.user.id)
    await admin.audit("admin.settings_updated", {
      targetType: "settings",
      targetId: input.section,
      metadata: { section: input.section, fields: res.changed, secrets: res.secretsChanged },
    })
    return res.settings as Record<string, unknown>
  }
)

/** Send a test email using the (possibly unsaved) email delivery form values. */
export const testEmailAction = adminAction(
  z.object({
    config: emailConfigInput,
    /** New password typed in the form; omit to use the stored one */
    password: z.string().max(4000).optional(),
    to: z.email("Enter a valid recipient address"),
  }),
  async (input, admin) => {
    const res = await sendTestEmail(input)
    await admin.audit("admin.test_email_sent", {
      targetType: "settings",
      targetId: "email",
      metadata: {
        provider: input.config.provider,
        host: input.config.provider === "ses" ? `email-smtp.${input.config.sesRegion}.amazonaws.com` : input.config.host,
        port: input.config.port,
        to: input.to,
        ok: res.ok,
      },
    })
    if (!res.ok) throw new ApiError(400, res.error)
    return { delivered: res.delivered, message: res.message }
  }
)

/** Write, read back and delete a small object using the *saved* storage configuration. */
export const testStorageAction = adminAction(z.object({}), async (_input, admin) => {
  const [storage, res] = await Promise.all([getSettings("storage"), testStorage()])
  await admin.audit("admin.storage_tested", {
    targetType: "settings",
    targetId: "storage",
    metadata: { driver: storage.driver, ok: res.ok },
  })
  if (!res.ok) throw new ApiError(400, `Storage test failed: ${res.error ?? "unknown error"}`)
  return {
    driver: storage.driver,
    message:
      storage.driver === "s3"
        ? `Wrote, read and deleted a test object in bucket “${storage.s3Bucket}”.`
        : "Wrote, read and deleted a test file on local disk.",
  }
})

/** Send a tiny prompt to the AI provider using the (possibly unsaved) form values. */
export const testAiAction = adminAction(
  z.object({
    provider: z.enum(["anthropic", "openai"]),
    model: z.string().trim().min(1, "Enter a model id").max(120),
    baseUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/, message: "Enter a full URL starting with https://" })]),
    /** New key typed in the form; omit to use the stored one */
    apiKey: z.string().max(4000).optional(),
  }),
  async (input, admin) => {
    const res = await testAiProvider(input)
    await admin.audit("admin.ai_tested", {
      targetType: "settings",
      targetId: "ai",
      metadata: { provider: input.provider, model: input.model, baseUrl: input.baseUrl || null, ok: res.ok },
    })
    if (!res.ok) throw new ApiError(400, res.error)
    return { latencyMs: res.latencyMs, model: res.model, reply: res.reply }
  }
)
