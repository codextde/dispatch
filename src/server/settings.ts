import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { encrypt, maskSecret, tryDecrypt } from "@/server/crypto"

/**
 * Instance settings (configured by the super admin in /admin/settings and the
 * first-run setup wizard). Every section has a zod schema with defaults, so a
 * fresh instance works with zero configuration.
 *
 * Secret fields end with `Enc` and are stored encrypted. Use `setSecret()` /
 * `readSecret()` helpers; never send decrypted values to the client.
 */

export const settingsSchemas = {
  general: z.object({
    instanceName: z.string().default("Dispatch"),
    /**
     * private: single company / self-hosted. Marketing site hidden, invite only.
     * saas: public hosted service with marketing site, public signups and billing.
     */
    mode: z.enum(["private", "saas"]).default("private"),
    marketingSite: z.boolean().default(true),
    supportEmail: z.string().default(""),
    defaultTimezone: z.string().default("UTC"),
    announcement: z.string().default(""),
  }),
  auth: z.object({
    /** open: anyone can sign up; invite_only: only invited emails; domains: only allowed domains */
    signupMode: z.enum(["open", "invite_only", "domains"]).default("invite_only"),
    allowedSignupDomains: z.array(z.string()).default([]),
    /** Who may create additional workspaces */
    workspaceCreation: z.enum(["anyone", "super_admins"]).default("anyone"),
    sessionDays: z.number().int().min(1).max(3650).default(365),
    magicLinkMinutes: z.number().int().min(5).max(120).default(15),
    googleLogin: z.boolean().default(false),
    microsoftLogin: z.boolean().default(false),
    /**
     * SaaS mode: email domains a super admin has verified for workspace
     * auto-join. Workspaces can only auto-admit members from these domains.
     */
    verifiedAutoJoinDomains: z.array(z.string()).default([]),
  }),
  email: z.object({
    /** log: print emails to server logs (no delivery) */
    provider: z.enum(["log", "smtp", "ses"]).default("log"),
    host: z.string().default(""),
    port: z.number().int().default(587),
    secure: z.boolean().default(false),
    user: z.string().default(""),
    passwordEnc: z.string().default(""),
    sesRegion: z.string().default("eu-central-1"),
    fromName: z.string().default("Dispatch"),
    fromEmail: z.string().default(""),
    replyTo: z.string().default(""),
  }),
  oauth: z.object({
    google: z
      .object({ enabled: z.boolean().default(false), clientId: z.string().default(""), clientSecretEnc: z.string().default("") })
      .default({ enabled: false, clientId: "", clientSecretEnc: "" }),
    microsoft: z
      .object({
        enabled: z.boolean().default(false),
        clientId: z.string().default(""),
        clientSecretEnc: z.string().default(""),
        tenant: z.string().default("common"),
      })
      .default({ enabled: false, clientId: "", clientSecretEnc: "", tenant: "common" }),
  }),
  billing: z.object({
    enabled: z.boolean().default(false),
    stripeSecretKeyEnc: z.string().default(""),
    stripePublishableKey: z.string().default(""),
    stripeWebhookSecretEnc: z.string().default(""),
    productId: z.string().default(""),
    priceId: z.string().default(""),
    /** in cents */
    amount: z.number().int().default(5000),
    currency: z.string().default("usd"),
    interval: z.enum(["month", "year"]).default("month"),
    trialDays: z.number().int().min(0).max(365).default(14),
    /** Lock workspaces without an active subscription (read-only) */
    enforce: z.boolean().default(true),
  }),
  storage: z.object({
    driver: z.enum(["local", "s3"]).default("local"),
    s3Endpoint: z.string().default(""),
    s3Region: z.string().default("auto"),
    s3Bucket: z.string().default(""),
    s3AccessKeyId: z.string().default(""),
    s3SecretEnc: z.string().default(""),
    s3ForcePathStyle: z.boolean().default(true),
    maxAttachmentMb: z.number().int().min(1).max(200).default(25),
  }),
  ai: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(["anthropic", "openai"]).default("anthropic"),
    apiKeyEnc: z.string().default(""),
    model: z.string().default("claude-sonnet-5"),
    baseUrl: z.string().default(""),
    allowOrgKeys: z.boolean().default(true),
  }),
  branding: z.object({
    productName: z.string().default("Dispatch"),
    logoUrl: z.string().default(""),
    accentColor: z.string().default(""),
    supportUrl: z.string().default(""),
  }),
  security: z.object({
    /** Block IMAP/SMTP/webhook connections to private networks (recommended for SaaS) */
    blockPrivateNetworks: z.boolean().default(false),
    loginRateLimitPerHour: z.number().int().min(1).max(1000).default(10),
    maxSessionsPerUser: z.number().int().min(1).max(1000).default(100),
    remoteImages: z.enum(["always", "ask", "never"]).default("ask"),
  }),
  legal: z.object({
    companyName: z.string().default(""),
    imprint: z.string().default(""),
    privacy: z.string().default(""),
    terms: z.string().default(""),
  }),
  setup: z.object({
    completedAt: z.string().nullable().default(null),
    version: z.number().default(1),
  }),
} as const

export type SettingsSection = keyof typeof settingsSchemas
export type Settings<K extends SettingsSection> = z.infer<(typeof settingsSchemas)[K]>
export type AllSettings = { [K in SettingsSection]: Settings<K> }

const CACHE_TTL_MS = 5_000
const cache = new Map<SettingsSection, { value: unknown; at: number }>()

export async function getSettings<K extends SettingsSection>(key: K): Promise<Settings<K>> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Settings<K>
  let raw: unknown = {}
  try {
    const row = await db.query.instanceSettings.findFirst({ where: eq(schema.instanceSettings.key, key) })
    raw = row?.value ?? {}
  } catch {
    raw = {}
  }
  const parsed = settingsSchemas[key].safeParse(raw)
  const value = (parsed.success ? parsed.data : settingsSchemas[key].parse({})) as Settings<K>
  cache.set(key, { value, at: Date.now() })
  return value
}

export async function getAllSettings(): Promise<AllSettings> {
  const keys = Object.keys(settingsSchemas) as SettingsSection[]
  const entries = await Promise.all(keys.map(async (k) => [k, await getSettings(k)] as const))
  return Object.fromEntries(entries) as AllSettings
}

/**
 * Merge-update a settings section. Secret fields (`*Enc`) passed as plain
 * values via `secrets` are encrypted; pass an empty string to clear, or omit
 * to keep the existing value.
 */
export async function updateSettings<K extends SettingsSection>(
  key: K,
  patch: Partial<Settings<K>>,
  opts: { secrets?: Record<string, string | undefined>; userId?: string } = {}
): Promise<Settings<K>> {
  const current = await getSettings(key)
  const next: Record<string, unknown> = { ...current, ...patch }
  for (const [field, plain] of Object.entries(opts.secrets ?? {})) {
    if (plain === undefined) continue
    setDeep(next, field, plain === "" ? "" : encrypt(plain))
  }
  const value = settingsSchemas[key].parse(next) as Settings<K>
  await db
    .insert(schema.instanceSettings)
    .values({ key, value, updatedBy: opts.userId })
    .onConflictDoUpdate({ target: schema.instanceSettings.key, set: { value, updatedBy: opts.userId, updatedAt: new Date() } })
  cache.set(key, { value, at: Date.now() })
  return value
}

function setDeep(obj: Record<string, unknown>, dotted: string, value: unknown) {
  const parts = dotted.split(".")
  let cur: Record<string, unknown> = obj
  for (const p of parts.slice(0, -1)) {
    cur[p] = { ...((cur[p] as Record<string, unknown>) ?? {}) }
    cur = cur[p] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

export function clearSettingsCache() {
  cache.clear()
}

/** Decrypt a stored secret field value. */
export function readSecret(value: string | undefined | null): string | undefined {
  return tryDecrypt(value)
}

/** Replace all `*Enc` fields by `{ set: boolean, preview: "sk_…1234" }` for the client. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.endsWith("Enc")) {
        const plain = typeof v === "string" ? tryDecrypt(v) : undefined
        out[k] = plain ? maskSecret(plain) : ""
      } else out[k] = redactSecrets(v)
    }
    return out as T
  }
  return value
}

/** Is the instance fully set up (a super admin exists and setup wizard finished)? */
export async function isSetupComplete(): Promise<boolean> {
  const setup = await getSettings("setup")
  return Boolean(setup.completedAt)
}
