import "server-only"
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { hashToken, hmac, randomCode, randomToken, safeEqual } from "@/server/crypto"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"
import { rateLimit } from "@/server/rate-limit"
import { sendMagicLinkEmail } from "@/server/mail/system-mailer"
import { acceptPendingInvitationsForEmail } from "@/server/orgs"
import { audit } from "@/server/audit"

/**
 * Passwordless authentication
 * ---------------------------
 * 1. requestMagicLink(email) → emails a one-time link AND a 6-digit code.
 * 2. The link opens /auth/verify which requires a click (POST) so that email
 *    security scanners pre-fetching links cannot consume the token.
 * 3. Or the user types the code on the login page (5 attempts per token).
 * Tokens are hashed at rest, single-use and expire after `auth.magicLinkMinutes`.
 */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().min(3).max(254))

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/** Only allow same-origin relative redirects. */
export function safeRedirect(path: string | null | undefined, fallback = "/"): string {
  if (!path || typeof path !== "string") return fallback
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback
  return path
}

/** Can this email sign in (existing user) or sign up (per instance policy)? */
export async function canEmailAuthenticate(email: string): Promise<{ allowed: boolean; existing: boolean; reason?: string }> {
  const user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` })
  if (user) {
    return user.status === "active" ? { allowed: true, existing: true } : { allowed: false, existing: true, reason: "disabled" }
  }
  const auth = await getSettings("auth")
  const invite = await db.query.invitations.findFirst({
    where: and(
      sql`lower(${schema.invitations.email}) = ${email}`,
      isNull(schema.invitations.acceptedAt),
      isNull(schema.invitations.revokedAt),
      gt(schema.invitations.expiresAt, new Date())
    ),
  })
  if (invite) return { allowed: true, existing: false }
  if (auth.signupMode === "open") return { allowed: true, existing: false }
  if (auth.signupMode === "domains") {
    const domain = email.split("@")[1] ?? ""
    const ok = auth.allowedSignupDomains.map((d) => d.toLowerCase().replace(/^@/, "")).includes(domain)
    return ok ? { allowed: true, existing: false } : { allowed: false, existing: false, reason: "domain" }
  }
  return { allowed: false, existing: false, reason: "invite_only" }
}

export type RequestResult =
  | { ok: true; delivered: boolean }
  | { ok: false; error: "rate_limited" | "invalid_email" | "not_allowed"; message: string }

export async function requestMagicLink(input: {
  email: string
  redirectTo?: string | null
  ip?: string | null
  userAgent?: string | null
}): Promise<RequestResult> {
  const parsed = emailSchema.safeParse(input.email)
  if (!parsed.success) return { ok: false, error: "invalid_email", message: "Please enter a valid email address." }
  const email = parsed.data
  const security = await getSettings("security")
  const auth = await getSettings("auth")

  const ipLimit = await rateLimit(`login:ip:${input.ip ?? "unknown"}`, 30, 3600)
  const emailLimit = await rateLimit(`login:email:${email}`, security.loginRateLimitPerHour, 3600)
  if (!ipLimit.ok || !emailLimit.ok) {
    return { ok: false, error: "rate_limited", message: "Too many sign-in attempts. Please try again later." }
  }

  const policy = await canEmailAuthenticate(email)
  if (!policy.allowed) {
    await audit({ action: "auth.login_denied", actorEmail: email, ip: input.ip, userAgent: input.userAgent, metadata: { reason: policy.reason } })
    const message =
      policy.reason === "disabled"
        ? "This account has been disabled. Contact your administrator."
        : policy.reason === "domain"
          ? "Sign-ups are restricted to approved email domains."
          : "This instance is invite-only. Ask a workspace admin to invite you."
    return { ok: false, error: "not_allowed", message }
  }

  const token = randomToken(32)
  const code = randomCode(6)
  const minutes = auth.magicLinkMinutes
  await db.insert(schema.loginTokens).values({
    email,
    tokenHash: hashToken(token),
    codeHash: hmac(`${email}:${code}`, "login-code"),
    redirectTo: safeRedirect(input.redirectTo, "") || null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    expiresAt: new Date(Date.now() + minutes * 60_000),
  })

  const url = `${getAppUrl()}/auth/verify?token=${encodeURIComponent(token)}`
  const { delivered } = await sendMagicLinkEmail(email, url, code, minutes)
  return { ok: true, delivered }
}

type VerifyResult =
  | { ok: true; userId: string; email: string; redirectTo: string | null; isNewUser: boolean }
  | { ok: false; error: string }

async function completeLogin(row: typeof schema.loginTokens.$inferSelect): Promise<VerifyResult> {
  // Single use: atomically mark as used
  const [used] = await db
    .update(schema.loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.loginTokens.id, row.id), isNull(schema.loginTokens.usedAt)))
    .returning({ id: schema.loginTokens.id })
  if (!used) return { ok: false, error: "This link has already been used." }

  const policy = await canEmailAuthenticate(row.email)
  if (!policy.allowed) return { ok: false, error: "You are not allowed to sign in." }

  let user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${row.email}` })
  let isNewUser = false
  if (!user) {
    const [created] = await db
      .insert(schema.users)
      .values({ email: row.email, name: null })
      .onConflictDoNothing()
      .returning()
    user = created ?? (await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${row.email}` }))
    isNewUser = Boolean(created)
  }
  if (!user) return { ok: false, error: "Could not create account." }
  await acceptPendingInvitationsForEmail(user.id, row.email)
  // Invalidate any other outstanding tokens for this email
  await db
    .update(schema.loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.loginTokens.email, row.email), isNull(schema.loginTokens.usedAt)))
  return { ok: true, userId: user.id, email: row.email, redirectTo: row.redirectTo, isNewUser }
}

export async function verifyMagicToken(token: string): Promise<VerifyResult> {
  if (!token || token.length > 200) return { ok: false, error: "Invalid sign-in link." }
  const row = await db.query.loginTokens.findFirst({ where: eq(schema.loginTokens.tokenHash, hashToken(token)) })
  if (!row) return { ok: false, error: "Invalid sign-in link." }
  if (row.usedAt) return { ok: false, error: "This link has already been used. Request a new one." }
  if (row.expiresAt < new Date()) return { ok: false, error: "This link has expired. Request a new one." }
  return completeLogin(row)
}

/** Peek at a token without consuming it (for the confirmation page). */
export async function peekMagicToken(token: string) {
  if (!token || token.length > 200) return null
  const row = await db.query.loginTokens.findFirst({ where: eq(schema.loginTokens.tokenHash, hashToken(token)) })
  if (!row || row.usedAt || row.expiresAt < new Date()) return null
  return { email: row.email }
}

export async function verifyLoginCode(emailInput: string, code: string, ip?: string | null): Promise<VerifyResult> {
  const email = normalizeEmail(emailInput)
  const cleaned = code.replace(/\D/g, "")
  if (cleaned.length !== 6) return { ok: false, error: "Enter the 6-digit code from the email." }
  const limit = await rateLimit(`code:ip:${ip ?? "unknown"}`, 50, 3600)
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please try again later." }

  const row = await db.query.loginTokens.findFirst({
    where: and(eq(schema.loginTokens.email, email), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())),
    orderBy: desc(schema.loginTokens.createdAt),
  })
  if (!row) return { ok: false, error: "This code has expired. Request a new one." }
  if (row.attempts >= 5) return { ok: false, error: "Too many incorrect attempts. Request a new code." }
  if (!safeEqual(row.codeHash, hmac(`${email}:${cleaned}`, "login-code"))) {
    await db
      .update(schema.loginTokens)
      .set({ attempts: sql`${schema.loginTokens.attempts} + 1` })
      .where(eq(schema.loginTokens.id, row.id))
    return { ok: false, error: "That code isn't right. Check the email and try again." }
  }
  return completeLogin(row)
}
