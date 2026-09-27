"use server"

import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { action } from "@/server/action"
import { db, schema } from "@/server/db"
import { AuthError, isOwner } from "@/server/authz"
import { audit } from "@/server/audit"
import { publish } from "@/server/realtime"
import { encrypt } from "@/server/crypto"
import { getSettings, readSecret } from "@/server/settings"
import { rateLimit } from "@/server/rate-limit"
import { getRequestMeta } from "@/server/request"
import { resolveHomePath } from "@/server/orgs"
import { AiError, aiComplete, type AiConfig } from "@/server/ai"
import { assertHostAllowed, BlockedHostError } from "@/server/mail/net-guard"
import { getStripe, hasLiveSubscription } from "@/server/billing"
import { hasDemoData, removeDemoData, seedDemoData } from "@/server/demo"
import {
  auditAction,
  fail,
  personalAction,
  revalidateSettings,
  revalidateWorkspace,
  workspaceAction,
} from "@/server/workspace/context"
import { deleteImageByUrl, imageUrl, storeImage } from "@/server/workspace/uploads"
import { scheduleStorageCleanup } from "@/server/workspace/storage-cleanup"
import {
  migrateLastOrgSlug,
  normalizeDomains,
  patchOrgSettings,
  PUBLIC_EMAIL_DOMAINS,
  TIME_RE,
  validateNewSlug,
  verifiedAdminDomains,
} from "@/server/workspace/services/general"
import { countActiveOwners } from "@/server/workspace/services/roles"
import { purgeMembership } from "@/server/workspace/services/members"

/**
 * Workspace → General settings. Everything requires `settings.manage`
 * except leaving (any member) and deleting (owners only).
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

/* -------------------------------- Identity -------------------------------- */

export const updateWorkspaceProfile = action(
  z.object({
    slug,
    name: z.string().trim().min(2, "Use at least 2 characters").max(80, "Keep it under 80 characters"),
    timezone: z.string().max(64).refine(isValidTimezone, "Unknown timezone"),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "settings.manage")
    await db.update(schema.organizations).set({ name: input.name }).where(eq(schema.organizations.id, ctx.org.id))
    await patchOrgSettings(ctx.org.id, (s) => ({ ...s, timezone: input.timezone }))
    await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, {
      section: "profile",
      ...(ctx.org.name !== input.name ? { name: { from: ctx.org.name, to: input.name } } : {}),
      timezone: input.timezone,
    })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return { name: input.name }
  }
)

export const changeWorkspaceSlug = action(z.object({ slug, newSlug: z.string().max(64) }), async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  const next = await validateNewSlug(ctx.org.id, input.newSlug)
  if (next === ctx.org.slug) return { slug: next }
  try {
    await db.update(schema.organizations).set({ slug: next }).where(eq(schema.organizations.id, ctx.org.id))
  } catch (err) {
    // unique index race
    if ((err as { code?: string }).code === "23505") fail("That URL is already taken.")
    throw err
  }
  await migrateLastOrgSlug(ctx.org.slug, next)
  await auditAction(ctx, "workspace.slug_changed", { type: "organization", id: ctx.org.id }, { from: ctx.org.slug, to: next })
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id, data: { slug: next } })
  // No revalidation here: the current URL (old slug) no longer exists; the client navigates.
  return { slug: next }
})

export const uploadWorkspaceLogo = action(z.object({ slug, file: z.instanceof(File, { message: "Choose an image" }) }), async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  const key = await storeImage("logos", ctx.org.id, input.file)
  const url = imageUrl(ctx.org.slug, key)
  await db.update(schema.organizations).set({ logoUrl: url }).where(eq(schema.organizations.id, ctx.org.id))
  await deleteImageByUrl(ctx.org.logoUrl)
  await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, { section: "logo" })
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
  revalidateWorkspace()
  return { logoUrl: url }
})

export const setWorkspaceLogoUrl = action(
  z.object({
    slug,
    url: z
      .url({ protocol: /^https$/, message: "Use an https:// image URL" })
      .max(1000)
      .nullable(),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "settings.manage")
    await db.update(schema.organizations).set({ logoUrl: input.url }).where(eq(schema.organizations.id, ctx.org.id))
    await deleteImageByUrl(ctx.org.logoUrl)
    await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, { section: "logo", removed: !input.url })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return { logoUrl: input.url }
  }
)

/* ------------------------------- Behaviour -------------------------------- */

export const updateConversationBehaviour = action(
  z.object({
    slug,
    reopenOnReply: z.boolean(),
    closeOnReply: z.boolean(),
    undoSendSeconds: z.number().int().min(0).max(30),
  }),
  async ({ slug: s, ...patch }) => {
    const ctx = await workspaceAction(s, "settings.manage")
    await patchOrgSettings(ctx.org.id, (cur) => ({ ...cur, ...patch }))
    await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, { section: "conversations", ...patch })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateWorkspace()
    return patch
  }
)

export const updateBusinessHours = action(
  z.object({
    slug,
    enabled: z.boolean(),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    start: z.string().regex(TIME_RE, "Use HH:MM"),
    end: z.string().regex(TIME_RE, "Use HH:MM"),
  }),
  async ({ slug: s, ...hours }) => {
    const ctx = await workspaceAction(s, "settings.manage")
    if (hours.enabled && hours.days.length === 0) fail("Pick at least one working day.")
    if (hours.enabled && hours.start >= hours.end) fail("The end time must be after the start time.")
    const businessHours = { ...hours, days: [...new Set(hours.days)].sort() }
    await patchOrgSettings(ctx.org.id, (cur) => ({ ...cur, businessHours }))
    await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, { section: "business_hours", ...businessHours })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateSettings()
    return businessHours
  }
)

/* --------------------------------- Access --------------------------------- */

export const updateWorkspaceAccess = action(
  z.object({
    slug,
    allowedDomains: z.array(z.string().max(253)).max(50),
    autoJoinDomains: z.boolean(),
    requireDomainForInvites: z.boolean(),
    defaultRoleId: z.uuid(),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "settings.manage")
    const domains = normalizeDomains(input.allowedDomains)
    const publicDomains = domains.filter((d) => PUBLIC_EMAIL_DOMAINS.has(d))
    if (input.autoJoinDomains && publicDomains.length) {
      fail(`Auto-join can't be used with public email providers (${publicDomains.join(", ")}).`)
    }
    if ((input.autoJoinDomains || input.requireDomainForInvites) && domains.length === 0) {
      fail("Add at least one domain first.")
    }
    if (input.autoJoinDomains) {
      const verified = await verifiedAdminDomains(ctx.org.id)
      const unverified = domains.filter((d) => !verified.has(d))
      if (unverified.length) {
        fail(
          `Auto-join only works for domains where a workspace admin has an email address. Not verified: ${unverified.join(", ")}.`
        )
      }
    }
    const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, input.defaultRoleId) })
    if (!role || role.orgId !== ctx.org.id) fail("Unknown role.")
    if (role.key === "owner") fail("New members can't join as owners.")
    if (!isOwner(ctx) && !role.permissions.every((p) => ctx.permissions.has(p))) {
      fail("You can't make a role with more permissions than your own the default.")
    }
    const patch = {
      allowedDomains: domains,
      autoJoinDomains: input.autoJoinDomains,
      requireDomainForInvites: input.requireDomainForInvites,
      defaultRoleId: role.id,
    }
    await patchOrgSettings(ctx.org.id, (cur) => ({ ...cur, ...patch }))
    await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, { section: "access", ...patch, defaultRole: role.name })
    await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
    revalidateSettings()
    return { allowedDomains: domains }
  }
)

/* ----------------------------------- AI ----------------------------------- */

const aiInput = z.object({
  slug,
  mode: z.enum(["instance", "off", "custom"]),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().trim().max(120),
  baseUrl: z.string().trim().max(500),
  /** New API key; empty = keep the stored key */
  apiKey: z.string().trim().max(500),
  clearKey: z.boolean().default(false),
})

async function validateBaseUrl(raw: string): Promise<string> {
  if (!raw) return ""
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    fail("Enter a valid base URL, e.g. https://api.openai.com/v1")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail("The base URL must start with https:// or http://")
  if (url.username || url.password) fail("Don't put credentials in the base URL — use the API key field.")
  try {
    await assertHostAllowed(url.hostname)
  } catch (err) {
    if (err instanceof BlockedHostError) fail(err.message)
    fail(`Could not resolve ${url.hostname}.`)
  }
  return url.toString().replace(/\/+$/, "")
}

/**
 * Resolve the key to use: a newly typed one, or the stored one — but only
 * while provider and base URL are unchanged, so a saved key can never be sent
 * to a new endpoint without re-entering it.
 */
function effectiveKey(
  input: z.infer<typeof aiInput>,
  stored: { apiKeyEnc?: string; provider?: string; baseUrl?: string },
  baseUrl: string
) {
  if (input.apiKey) return input.apiKey
  if (input.clearKey || !stored.apiKeyEnc) return undefined
  const sameEndpoint = (stored.provider ?? "anthropic") === input.provider && (stored.baseUrl ?? "") === baseUrl
  if (!sameEndpoint) fail("Enter the API key again when changing the provider or base URL.")
  return readSecret(stored.apiKeyEnc) ?? undefined
}

async function assertOrgKeysAllowed() {
  const instance = await getSettings("ai")
  if (!instance.allowOrgKeys) fail("The instance administrator doesn't allow workspace AI keys.")
}

export const updateWorkspaceAi = action(aiInput, async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  const stored = ctx.org.settings.ai ?? {}

  let ai: NonNullable<typeof ctx.org.settings.ai>
  if (input.mode === "off") {
    ai = { enabled: false }
  } else if (input.mode === "instance") {
    ai = {}
  } else {
    await assertOrgKeysAllowed()
    const baseUrl = await validateBaseUrl(input.baseUrl)
    const key = effectiveKey(input, stored, baseUrl)
    if (!key && !(input.provider === "openai" && baseUrl)) {
      fail(input.provider === "anthropic" ? "Enter your Anthropic API key." : "Enter an API key, or a base URL for a keyless OpenAI-compatible server.")
    }
    ai = {
      enabled: true,
      provider: input.provider,
      model: input.model || undefined,
      baseUrl: baseUrl || undefined,
      apiKeyEnc: key ? (input.apiKey ? encrypt(key) : stored.apiKeyEnc) : undefined,
    }
  }
  await patchOrgSettings(ctx.org.id, (cur) => ({ ...cur, ai }))
  await auditAction(ctx, "settings.updated", { type: "organization", id: ctx.org.id }, {
    section: "ai",
    mode: input.mode,
    provider: input.mode === "custom" ? input.provider : undefined,
    model: input.mode === "custom" ? input.model || null : undefined,
    keyChanged: Boolean(input.apiKey) || input.clearKey,
  })
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
  revalidateWorkspace()
  return { mode: input.mode }
})

export const testWorkspaceAi = action(aiInput, async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  if (input.mode !== "custom") fail("Choose “Use our own API key” to test a workspace configuration.")
  await assertOrgKeysAllowed()
  const limit = await rateLimit(`ai-test:${ctx.org.id}`, 10, 600)
  if (!limit.ok) fail("Too many tests. Try again in a few minutes.", 429)
  const baseUrl = await validateBaseUrl(input.baseUrl)
  const config: AiConfig = {
    provider: input.provider,
    model: input.model || (input.provider === "anthropic" ? "claude-sonnet-5" : "gpt-4o-mini"),
    apiKey: effectiveKey(input, ctx.org.settings.ai ?? {}, baseUrl) ?? null,
    baseUrl: baseUrl || null,
    source: "workspace",
  }
  const started = Date.now()
  try {
    const reply = await aiComplete({
      orgId: ctx.org.id,
      system: "You are a connectivity check. Reply with the single word OK.",
      messages: [{ role: "user", content: "Ping" }],
      maxTokens: 16,
      config,
    })
    return { ok: true as const, model: config.model, latencyMs: Date.now() - started, reply: reply.slice(0, 80) }
  } catch (err) {
    if (err instanceof AiError) fail(err.message, 400)
    throw err
  }
})

/* -------------------------------- Demo data ------------------------------- */

export const loadDemoData = action(z.object({ slug }), async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  // seedDemoData writes its own "demo.seeded" audit entry (with the manifest used for removal)
  const res = await seedDemoData(ctx.org.id, ctx.user.id)
  for (const type of ["org.updated", "account.updated", "labels.updated", "conversation.created"] as const) {
    await publish({ orgId: ctx.org.id, type, actorId: ctx.user.id })
  }
  revalidateWorkspace()
  return res
})

export const clearDemoData = action(z.object({ slug }), async (input) => {
  const ctx = await workspaceAction(input.slug, "settings.manage")
  if (!(await hasDemoData(ctx.org.id))) fail("There is no demo data in this workspace.")
  await removeDemoData(ctx.org.id)
  await auditAction(ctx, "demo.removed", { type: "organization", id: ctx.org.id })
  for (const type of ["org.updated", "account.updated", "labels.updated", "conversation.deleted"] as const) {
    await publish({ orgId: ctx.org.id, type, actorId: ctx.user.id })
  }
  revalidateWorkspace()
  return { ok: true }
})

/* ------------------------------- Danger zone ------------------------------ */

export const leaveWorkspace = action(z.object({ slug }), async (input) => {
  const ctx = await personalAction(input.slug)
  if (isOwner(ctx) && (await countActiveOwners(ctx.org.id, ctx.user.id)) === 0) {
    fail("You're the only owner. Make someone else an owner first, or delete the workspace.")
  }
  await auditAction(ctx, "member.left", { type: "user", id: ctx.user.id }, { email: ctx.user.email })
  const { storageKeys } = await purgeMembership(ctx.org.id, ctx.user.id)
  scheduleStorageCleanup(storageKeys)
  await publish({ orgId: ctx.org.id, type: "org.updated", actorId: ctx.user.id })
  const next = await resolveHomePath({ id: ctx.user.id, preferences: { ...ctx.user.preferences, lastOrgSlug: undefined } })
  return { redirectTo: next }
})

export const deleteWorkspace = action(z.object({ slug, confirm: z.string() }), async (input) => {
  const ctx = await personalAction(input.slug)
  if (!isOwner(ctx)) throw new AuthError(403, "Only owners can delete the workspace.")
  if (input.confirm.trim() !== ctx.org.slug) fail("Type the workspace URL to confirm.")

  // Stop billing first so a deleted workspace is never charged again.
  if (hasLiveSubscription(ctx.org)) {
    try {
      const stripe = await getStripe()
      await stripe.subscriptions.cancel(ctx.org.stripeSubscriptionId!)
    } catch (err) {
      console.error("[workspace] failed to cancel subscription before delete", err)
      fail("We couldn't cancel the subscription. Cancel it under Billing first, then delete the workspace.")
    }
  }

  const meta = await getRequestMeta()
  const counts = await db.execute<{ members: number; conversations: number }>(sql`select
    (select count(*)::int from memberships where org_id = ${ctx.org.id}) as members,
    (select count(*)::int from conversations where org_id = ${ctx.org.id}) as conversations`)
  // Every file uploaded in the workspace (message, comment and unsent draft attachments)
  const files = await db.execute<{ key: string }>(sql`select distinct storage_key as key from attachments where org_id = ${ctx.org.id}`)
  await db.delete(schema.organizations).where(eq(schema.organizations.id, ctx.org.id))
  // Attachment rows cascade with the workspace; their files are removed after the response
  scheduleStorageCleanup(files.map((r) => r.key))
  await deleteImageByUrl(ctx.org.logoUrl)
  // Instance-level entry: the workspace's own audit log is deleted with it.
  await audit({
    orgId: null,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: "workspace.deleted",
    targetType: "organization",
    targetId: ctx.org.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { name: ctx.org.name, slug: ctx.org.slug, ...(counts[0] ?? {}) },
  })
  const next = await resolveHomePath({ id: ctx.user.id, preferences: { ...ctx.user.preferences, lastOrgSlug: undefined } })
  return { redirectTo: next }
})
