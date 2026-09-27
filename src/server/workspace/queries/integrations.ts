import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { db, schema } from "@/server/db"
import { hashToken, randomToken } from "@/server/crypto"
import { isPrivateAddress } from "@/server/mail/ip-ranges"

export type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdBy: { id: string; name: string | null; email: string; avatarUrl: string | null } | null
}

export async function loadApiKeys(orgId: string): Promise<ApiKeyRow[]> {
  const k = schema.apiKeys
  const rows = await db
    .select({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      userId: schema.users.id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      userAvatar: schema.users.avatarUrl,
    })
    .from(k)
    .leftJoin(schema.users, eq(schema.users.id, k.userId))
    .where(eq(k.orgId, orgId))
    // active keys first, then newest
    .orderBy(sql`${k.revokedAt} is not null`, desc(k.createdAt))
    .limit(200)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    createdBy: r.userId ? { id: r.userId, name: r.userName, email: r.userEmail!, avatarUrl: r.userAvatar } : null,
  }))
}

export type WebhookRow = {
  id: string
  name: string
  url: string
  events: string[]
  enabled: boolean
  lastStatus: number | null
  lastDeliveredAt: Date | null
  failureCount: number
  createdAt: Date
  deliveries24h: number
  failed24h: number
}

export async function loadWebhooks(orgId: string): Promise<WebhookRow[]> {
  const w = schema.webhooks
  return db
    .select({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events,
      enabled: w.enabled,
      lastStatus: w.lastStatus,
      lastDeliveredAt: w.lastDeliveredAt,
      failureCount: w.failureCount,
      createdAt: w.createdAt,
      // Correlated subqueries: reference the outer table explicitly (drizzle renders
      // bare column names inside select fields, which would bind to the inner table)
      deliveries24h: sql<number>`(select count(*)::int from webhook_deliveries d where d.webhook_id = "webhooks"."id" and d.created_at > now() - interval '24 hours')`,
      failed24h: sql<number>`(select count(*)::int from webhook_deliveries d where d.webhook_id = "webhooks"."id" and d.status = 'failed' and d.created_at > now() - interval '24 hours')`,
    })
    .from(w)
    .where(eq(w.orgId, orgId))
    .orderBy(desc(w.createdAt))
}

export type WebhookDeliveryRow = {
  id: string
  event: string
  status: "pending" | "success" | "failed"
  attempts: number
  responseStatus: number | null
  responseBody: string | null
  payload: unknown
  createdAt: Date
  deliveredAt: Date | null
  nextAttemptAt: Date
}

/** Latest deliveries of a webhook that belongs to `orgId` (empty when it doesn't). */
export async function loadWebhookDeliveries(orgId: string, webhookId: string, limit = 50): Promise<WebhookDeliveryRow[]> {
  const d = schema.webhookDeliveries
  const rows = await db
    .select({
      id: d.id,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      responseStatus: d.responseStatus,
      responseBody: d.responseBody,
      payload: d.payload,
      createdAt: d.createdAt,
      deliveredAt: d.deliveredAt,
      nextAttemptAt: d.nextAttemptAt,
    })
    .from(d)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, d.webhookId))
    .where(and(eq(d.webhookId, webhookId), eq(schema.webhooks.orgId, orgId)))
    .orderBy(desc(d.createdAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, responseBody: r.responseBody ? r.responseBody.slice(0, 20_000) : null }))
}

/* ------------------------------------------------------------------------------------------ */
/*                              Helpers (used by the server actions)                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * New API key: `dsp_` + 32 random bytes (base64url). Only the SHA-256 hash is
 * stored; `prefix` (first 12 chars = "dsp_" + 8 random chars) identifies the
 * key in lists without revealing it.
 */
export function generateApiKey() {
  const key = `dsp_${randomToken(32)}`
  return { key, keyHash: hashToken(key), prefix: key.slice(0, 12) }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * Validate a webhook endpoint URL. HTTPS is required; plain HTTP is only
 * allowed for localhost outside production. When the instance blocks private
 * networks, hosts resolving to private addresses are rejected.
 * Returns an error message, or null when the URL is acceptable.
 */
export async function validateWebhookUrl(raw: string, opts: { blockPrivateNetworks: boolean; production: boolean }): Promise<string | null> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return "Enter a valid URL, e.g. https://example.com/webhooks/dispatch"
  }
  if (url.username || url.password) return "Credentials in the URL aren't allowed — use the signing secret to authenticate."
  const host = url.hostname.toLowerCase()
  const isLocal = LOCAL_HOSTS.has(host) || host.endsWith(".localhost")
  if (url.protocol === "http:") {
    if (!isLocal || opts.production) return "The URL must use https://"
  } else if (url.protocol !== "https:") {
    return "The URL must use https://"
  }
  if (!opts.blockPrivateNetworks) return null
  if (isLocal) return "Private network addresses are blocked on this instance."
  const bare = host.replace(/^\[|\]$/g, "")
  if (isIP(bare)) {
    // The ranges the delivery-time guard refuses (src/server/mail/ip-ranges.ts)
    return isPrivateAddress(bare) ? "Private network addresses are blocked on this instance." : null
  }
  try {
    const results = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000)),
    ])
    if (results.some((r) => isPrivateAddress(r.address))) return "This host resolves to a private network address, which is blocked on this instance."
  } catch {
    return `Couldn't resolve ${host}. Check the domain name.`
  }
  return null
}
