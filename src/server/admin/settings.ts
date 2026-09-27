import "server-only"
import { z } from "zod"
import { getSettings, readSecret, updateSettings, type Settings, type SettingsSection } from "@/server/settings"
import { ApiError } from "@/server/api"

/**
 * Admin-side editing of instance settings.
 *
 * - Input schemas are strict and never contain `*Enc` fields; secrets travel
 *   separately as `{ "<field path>": "<new plain value>" }` and are only
 *   written when the admin entered a new value ("" clears the secret).
 * - Nested sections (oauth) are deep-merged so partial updates never wipe a
 *   stored secret.
 */

export const EDITABLE_SECTIONS = [
  "general",
  "auth",
  "email",
  "oauth",
  "billing",
  "storage",
  "ai",
  "branding",
  "security",
  "legal",
] as const satisfies readonly SettingsSection[]
export type EditableSection = (typeof EDITABLE_SECTIONS)[number]

/** Secret field paths (dot notation) per section. */
export const SECRET_FIELDS: Record<EditableSection, readonly string[]> = {
  general: [],
  auth: [],
  email: ["passwordEnc"],
  oauth: ["google.clientSecretEnc", "microsoft.clientSecretEnc"],
  billing: ["stripeSecretKeyEnc", "stripeWebhookSecretEnc"],
  storage: ["s3SecretEnc"],
  ai: ["apiKeyEnc"],
  branding: [],
  security: [],
  legal: [],
}

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email address")])
const optionalUrl = z.union([
  z.literal(""),
  z.url({ protocol: /^https?$/, message: "Enter a full URL starting with https://" }),
])
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^@/, ""))
  .pipe(z.string().regex(/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/, "Enter a domain like acme.com"))

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const emailConfigInput = z.object({
  provider: z.enum(["log", "smtp", "ses"]),
  host: z.string().trim().max(255).default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().max(255).default(""),
  sesRegion: z.string().trim().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "Choose an AWS region").default("eu-central-1"),
  fromName: z.string().trim().max(120).default(""),
  fromEmail: optionalEmail.default(""),
  replyTo: optionalEmail.default(""),
})
export type EmailConfigInput = z.infer<typeof emailConfigInput>

export const settingsInputSchemas = {
  general: z
    .object({
      instanceName: z.string().trim().min(1, "Instance name is required").max(80),
      mode: z.enum(["private", "saas"]),
      marketingSite: z.boolean(),
      supportEmail: optionalEmail,
      defaultTimezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
      announcement: z.string().trim().max(500),
    })
    .strict()
    .partial(),
  auth: z
    .object({
      signupMode: z.enum(["open", "invite_only", "domains"]),
      allowedSignupDomains: z.array(domain).max(200),
      workspaceCreation: z.enum(["anyone", "super_admins"]),
      sessionDays: z.coerce.number().int().min(1).max(3650),
      magicLinkMinutes: z.coerce.number().int().min(5).max(120),
      googleLogin: z.boolean(),
      microsoftLogin: z.boolean(),
    })
    .strict()
    .partial(),
  email: emailConfigInput.strict().partial(),
  oauth: z
    .object({
      google: z.object({ enabled: z.boolean(), clientId: z.string().trim().max(500) }).strict().partial(),
      microsoft: z
        .object({
          enabled: z.boolean(),
          clientId: z.string().trim().max(500),
          tenant: z
            .string()
            .trim()
            .max(100)
            .regex(/^[A-Za-z0-9.-]*$/, "Use common, organizations, consumers or a tenant id/domain"),
        })
        .strict()
        .partial(),
    })
    .strict()
    .partial(),
  billing: z
    .object({
      enabled: z.boolean(),
      stripePublishableKey: z
        .string()
        .trim()
        .max(255)
        .refine((v) => v === "" || v.startsWith("pk_"), "Publishable keys start with pk_"),
      productId: z.string().trim().max(255),
      priceId: z.string().trim().max(255),
      amount: z.coerce.number().int().min(0).max(100_000_000),
      currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/, "Use a 3-letter ISO currency code"),
      interval: z.enum(["month", "year"]),
      trialDays: z.coerce.number().int().min(0).max(365),
      enforce: z.boolean(),
    })
    .strict()
    .partial(),
  storage: z
    .object({
      driver: z.enum(["local", "s3"]),
      s3Endpoint: optionalUrl,
      s3Region: z.string().trim().max(60),
      s3Bucket: z.string().trim().max(255),
      s3AccessKeyId: z.string().trim().max(255),
      s3ForcePathStyle: z.boolean(),
      maxAttachmentMb: z.coerce.number().int().min(1).max(200),
    })
    .strict()
    .partial(),
  ai: z
    .object({
      enabled: z.boolean(),
      provider: z.enum(["anthropic", "openai"]),
      model: z.string().trim().min(1, "Model is required").max(120),
      baseUrl: optionalUrl,
      allowOrgKeys: z.boolean(),
    })
    .strict()
    .partial(),
  branding: z
    .object({
      productName: z.string().trim().min(1, "Product name is required").max(60),
      logoUrl: z.union([
        z.literal(""),
        z.string().trim().regex(/^\/[^/\\]/, "Use an absolute URL or a path starting with /"),
        z.url({ protocol: /^https?$/ }),
      ]),
      accentColor: z.union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #22c55e")]),
      supportUrl: z.union([optionalUrl, z.string().trim().regex(/^mailto:.+@.+/)]),
    })
    .strict()
    .partial(),
  security: z
    .object({
      blockPrivateNetworks: z.boolean(),
      loginRateLimitPerHour: z.coerce.number().int().min(1).max(1000),
      maxSessionsPerUser: z.coerce.number().int().min(1).max(1000),
      remoteImages: z.enum(["always", "ask", "never"]),
    })
    .strict()
    .partial(),
  legal: z
    .object({
      companyName: z.string().trim().max(200),
      imprint: z.string().max(100_000),
      privacy: z.string().max(100_000),
      terms: z.string().max(100_000),
    })
    .strict()
    .partial(),
} satisfies Record<EditableSection, z.ZodType>

export type SettingsInput<K extends EditableSection> = z.infer<(typeof settingsInputSchemas)[K]>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v
  }
  return out as T
}

/** Dot paths of fields whose value differs (secrets excluded, values never returned). */
function changedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].flatMap((k) => (k.endsWith("Enc") ? [] : changedPaths(before[k], after[k], prefix ? `${prefix}.${k}` : k)))
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix]
}

/**
 * Validate and persist a settings section. Returns the redacted settings plus
 * which (non secret) fields and which secrets changed — for the audit log.
 */
export async function saveSettingsSection<K extends EditableSection>(
  section: K,
  rawValues: unknown,
  rawSecrets: Record<string, string> | undefined,
  userId: string
) {
  const values = settingsInputSchemas[section].parse(rawValues ?? {}) as Record<string, unknown>
  const allowedSecrets = SECRET_FIELDS[section]
  const secrets: Record<string, string> = {}
  for (const [field, value] of Object.entries(rawSecrets ?? {})) {
    if (!allowedSecrets.includes(field)) throw new ApiError(400, `Unknown secret field: ${field}`)
    if (value.length > 4000) throw new ApiError(400, "Secret value is too long")
    secrets[field] = value.trim()
  }

  const current = await getSettings(section)
  const merged = deepMerge(current as Record<string, unknown>, values) as Partial<Settings<K>>
  await validateCrossSection(section, merged as Record<string, unknown>)
  const next = await updateSettings(section, merged, { secrets, userId })

  return {
    settings: redactForAdmin(next),
    changed: changedPaths(current, next),
    secretsChanged: Object.keys(secrets),
  }
}

/** Rules that span sections (e.g. social login requires a configured OAuth app). */
async function validateCrossSection(section: EditableSection, next: Record<string, unknown>) {
  if (section === "auth") {
    const oauth = await getSettings("oauth")
    if (next.googleLogin && !(oauth.google.enabled && oauth.google.clientId && oauth.google.clientSecretEnc)) {
      throw new ApiError(400, "Configure and enable the Google OAuth app before turning on Google sign-in.")
    }
    if (next.microsoftLogin && !(oauth.microsoft.enabled && oauth.microsoft.clientId && oauth.microsoft.clientSecretEnc)) {
      throw new ApiError(400, "Configure and enable the Microsoft OAuth app before turning on Microsoft sign-in.")
    }
    if (next.signupMode === "domains" && !(next.allowedSignupDomains as string[] | undefined)?.length) {
      throw new ApiError(400, "Add at least one allowed domain, or choose another sign-up policy.")
    }
  }
}

/* -------------------------------- Redaction ------------------------------- */

/** Secrets whose leading characters are a well-known, non-secret prefix (sk_live_, sk-ant-, GOCSPX-, whsec_ …). */
const PREFIXED_SECRETS = new Set(["stripeSecretKeyEnc", "stripeWebhookSecretEnc", "apiKeyEnc", "clientSecretEnc"])
const KNOWN_PREFIX = /^(?:[sr]k_(?:live|test)_|whsec_|sk-ant-(?:[a-z]+\d*-)?|sk-proj-|sk-|GOCSPX-)/
const DOTS = "••••••••"

function maskForAdmin(field: string, plain: string): string {
  if (field === "passwordEnc" || plain.length < 16) return DOTS
  const prefix = PREFIXED_SECRETS.has(field) ? (plain.match(KNOWN_PREFIX)?.[0] ?? "") : ""
  return `${prefix}${DOTS}${plain.slice(-4)}`
}

/**
 * Replace every `*Enc` field by a masked preview for the admin UI ("" when
 * unset). Stricter than `redactSecrets`: passwords and short secrets reveal
 * nothing; long keys reveal only a known prefix and the last 4 characters.
 */
export function redactForAdmin<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactForAdmin(v)) as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k.endsWith("Enc")) {
        const plain = typeof v === "string" ? readSecret(v) : undefined
        out[k] = plain ? maskForAdmin(k, plain) : ""
      } else out[k] = redactForAdmin(v)
    }
    return out as T
  }
  return value
}

