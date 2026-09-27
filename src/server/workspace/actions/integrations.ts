"use server"

import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { action } from "@/server/action"
import { assertPermission, requireOrg } from "@/server/authz"
import { randomToken } from "@/server/crypto"
import { db, schema } from "@/server/db"
import { newWebhookSecret, WEBHOOK_EVENTS } from "@/server/jobs"
import { isPrivateNetworkBlocked } from "@/server/mail/net-guard"
import { assertNotImpersonating, auditAction, fail, revalidateSettings, workspaceAction } from "@/server/workspace/context"
import {
  generateApiKey,
  loadWebhookDeliveries,
  validateWebhookUrl,
  type WebhookDeliveryRow,
} from "@/server/workspace/queries/integrations"
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions"

const slug = z.string().min(1).max(64)
const id = z.uuid()

/* --------------------------------------------------------------------------------------------- */
/*                                           API keys                                            */
/* --------------------------------------------------------------------------------------------- */

const MAX_EXPIRY_MS = 5 * 365 * 86_400_000

export const createApiKey = action(
  z.object({
    slug,
    name: z.string().trim().min(1, "Give the key a name").max(80, "Keep the name under 80 characters"),
    /** ISO timestamp or null for a key that never expires */
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    /** Empty = full access of the creator's role */
    scopes: z.array(z.string()).max(ALL_PERMISSIONS.length),
  }),
  async (input) => {
    const ctx = await workspaceAction(input.slug, "integrations.manage")
    assertNotImpersonating(ctx, "create API keys")

    const scopes = [...new Set(input.scopes)]
    for (const s of scopes) {
      if (!ALL_PERMISSIONS.includes(s as Permission)) fail(`Unknown permission “${s}”.`)
      if (!ctx.permissions.has(s)) fail(`You can't grant “${s}” because your role doesn't have it.`)
    }

    let expiresAt: Date | null = null
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt)
      const delta = expiresAt.getTime() - Date.now()
      if (delta < 3_600_000) fail("The expiry date must be in the future.")
      if (delta > MAX_EXPIRY_MS) fail("Keys can be valid for at most 5 years.")
    }

    const { key, keyHash, prefix } = generateApiKey()
    const [row] = await db
      .insert(schema.apiKeys)
      .values({ orgId: ctx.org.id, userId: ctx.user.id, name: input.name, prefix, keyHash, scopes, expiresAt })
      .returning({ id: schema.apiKeys.id })

    await auditAction(ctx, "api_key.created", { type: "api_key", id: row!.id }, {
      name: input.name,
      prefix,
      scopes: scopes.length ? scopes : "full",
      expiresAt: expiresAt?.toISOString() ?? null,
    })
    revalidateSettings()
    return { id: row!.id, key, prefix }
  }
)

export const revokeApiKey = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const [row] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, input.id), eq(schema.apiKeys.orgId, ctx.org.id), isNull(schema.apiKeys.revokedAt)))
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix })
  if (!row) fail("API key not found or already revoked.", 404)
  await auditAction(ctx, "api_key.revoked", { type: "api_key", id: row.id }, { name: row.name, prefix: row.prefix })
  revalidateSettings()
  return { id: row.id }
})

/* --------------------------------------------------------------------------------------------- */
/*                                           Webhooks                                            */
/* --------------------------------------------------------------------------------------------- */

const events = z
  .array(z.enum(["*", ...WEBHOOK_EVENTS]))
  .min(1, "Pick at least one event")
  .transform((list) => (list.includes("*") ? ["*"] : [...new Set(list)]))

const webhookFields = {
  name: z.string().trim().min(1, "Give the endpoint a name").max(80, "Keep the name under 80 characters"),
  url: z.string().trim().min(1, "Enter the endpoint URL").max(2000, "The URL is too long"),
  events,
}

async function checkUrl(url: string) {
  const error = await validateWebhookUrl(url, {
    // Same switch as the delivery-time guard (always on in SaaS mode)
    blockPrivateNetworks: await isPrivateNetworkBlocked(),
    production: process.env.NODE_ENV === "production",
  })
  if (error) fail(error)
  return new URL(url).toString()
}

async function findWebhook(orgId: string, webhookId: string) {
  const hook = await db.query.webhooks.findFirst({
    where: and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.orgId, orgId)),
  })
  if (!hook) fail("Webhook not found.", 404)
  return hook
}

export const createWebhook = action(z.object({ slug, ...webhookFields }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  assertNotImpersonating(ctx, "create webhooks")
  const url = await checkUrl(input.url)
  const count = await db.$count(schema.webhooks, eq(schema.webhooks.orgId, ctx.org.id))
  if (count >= 50) fail("A workspace can have at most 50 webhook endpoints.")

  const { secret, secretEnc } = newWebhookSecret()
  const [row] = await db
    .insert(schema.webhooks)
    .values({ orgId: ctx.org.id, name: input.name, url, events: input.events, secretEnc, createdBy: ctx.user.id })
    .returning({ id: schema.webhooks.id })

  await auditAction(ctx, "webhook.created", { type: "webhook", id: row!.id }, { name: input.name, url, events: input.events })
  revalidateSettings()
  return { id: row!.id, secret }
})

export const updateWebhook = action(z.object({ slug, id, ...webhookFields, enabled: z.boolean() }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const hook = await findWebhook(ctx.org.id, input.id)
  if (input.url !== hook.url) assertNotImpersonating(ctx, "point webhooks at a new URL")
  const url = input.url === hook.url ? hook.url : await checkUrl(input.url)
  await db
    .update(schema.webhooks)
    .set({
      name: input.name,
      url,
      events: input.events,
      enabled: input.enabled,
      ...(input.enabled && !hook.enabled ? { failureCount: 0 } : {}),
    })
    .where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.orgId, ctx.org.id)))
  await auditAction(ctx, "webhook.updated", { type: "webhook", id: hook.id }, {
    name: input.name,
    url,
    events: input.events,
    enabled: input.enabled,
  })
  revalidateSettings()
  return { id: hook.id }
})

export const setWebhookEnabled = action(z.object({ slug, id, enabled: z.boolean() }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const hook = await findWebhook(ctx.org.id, input.id)
  await db
    .update(schema.webhooks)
    .set({ enabled: input.enabled, ...(input.enabled ? { failureCount: 0 } : {}) })
    .where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.orgId, ctx.org.id)))
  await auditAction(ctx, "webhook.updated", { type: "webhook", id: hook.id }, { name: hook.name, enabled: input.enabled })
  revalidateSettings()
  return { id: hook.id, enabled: input.enabled }
})

export const deleteWebhook = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const hook = await findWebhook(ctx.org.id, input.id)
  await db.delete(schema.webhooks).where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.orgId, ctx.org.id)))
  await auditAction(ctx, "webhook.deleted", { type: "webhook", id: hook.id }, { name: hook.name, url: hook.url })
  revalidateSettings()
  return { id: hook.id }
})

export const rollWebhookSecret = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  assertNotImpersonating(ctx, "roll webhook secrets")
  const hook = await findWebhook(ctx.org.id, input.id)
  const { secret, secretEnc } = newWebhookSecret()
  await db
    .update(schema.webhooks)
    .set({ secretEnc })
    .where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.orgId, ctx.org.id)))
  await auditAction(ctx, "webhook.secret_rolled", { type: "webhook", id: hook.id }, { name: hook.name })
  return { id: hook.id, secret }
})

async function queueDelivery(webhookId: string, event: string, payload: Record<string, unknown>) {
  const [row] = await db
    .insert(schema.webhookDeliveries)
    .values({ webhookId, event, payload })
    .returning({ id: schema.webhookDeliveries.id })
  await db.execute(sql`select pg_notify('dispatch_jobs', 'webhook')`).catch(() => {})
  return row!.id
}

export const sendTestWebhook = action(z.object({ slug, id }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const hook = await findWebhook(ctx.org.id, input.id)
  const deliveryId = await queueDelivery(hook.id, "ping", {
    id: `evt_${randomToken(12)}`,
    event: "ping",
    createdAt: new Date().toISOString(),
    data: {
      webhookId: hook.id,
      orgId: ctx.org.id,
      message: `Test event from ${ctx.org.name}. If you can read this, your endpoint is receiving Dispatch webhooks.`,
    },
  })
  await auditAction(ctx, "webhook.tested", { type: "webhook", id: hook.id }, { name: hook.name, deliveryId })
  revalidateSettings()
  return { deliveryId, enabled: hook.enabled }
})

export const redeliverWebhookDelivery = action(z.object({ slug, id, deliveryId: id }), async (input) => {
  const ctx = await workspaceAction(input.slug, "integrations.manage")
  const hook = await findWebhook(ctx.org.id, input.id)
  const original = await db.query.webhookDeliveries.findFirst({
    where: and(eq(schema.webhookDeliveries.id, input.deliveryId), eq(schema.webhookDeliveries.webhookId, hook.id)),
  })
  if (!original) fail("Delivery not found.", 404)
  const deliveryId = await queueDelivery(hook.id, original.event, original.payload as Record<string, unknown>)
  await auditAction(ctx, "webhook.redelivered", { type: "webhook", id: hook.id }, { name: hook.name, deliveryId, originalId: original.id })
  revalidateSettings()
  return { deliveryId }
})

/** Recent deliveries for the deliveries sheet (read-only; allowed while the workspace is locked). */
export const getWebhookDeliveries = action(z.object({ slug, id }), async (input): Promise<WebhookDeliveryRow[]> => {
  const ctx = await requireOrg(input.slug)
  assertPermission(ctx, "integrations.manage")
  await findWebhook(ctx.org.id, input.id)
  return loadWebhookDeliveries(ctx.org.id, input.id, 50)
})
