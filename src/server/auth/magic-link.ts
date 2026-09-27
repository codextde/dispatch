import "server-only"
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"
import { hashToken, hmac, randomCode, randomToken, safeEqual } from "@/server/crypto"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"
import { rateLimit } from "@/server/rate-limit"
import { renderEmailLayout, sendMagicLinkEmail, sendSystemEmail } from "@/server/mail/system-mailer"
import { acceptPendingInvitationsForEmail } from "@/server/orgs"
import { joinWorkspacesByEmailDomain } from "@/server/workspace/auto-join"
import { approvedAutoJoinDomains, isPublicEmailDomain } from "@/server/workspace/services/general"
import { audit } from "@/server/audit"

/**
 * Passwordless authentication
 * ---------------------------
 * 1. requestMagicLink(email) → emails a one-time link AND a 6-digit code.
 * 2. The link opens /auth/verify which requires a click (POST) so that email
 *    security scanners pre-fetching links cannot consume the token.
 * 3. Or the user types the code on the login page (5 attempts per token,
 *    30 per hour and 20 wrong codes per day per email).
 * Tokens are hashed at rest, single-use and expire after `auth.magicLinkMinutes`.
 *
 * The response to step 1 never reveals whether an address has an account or
 * may sign up: addresses the policy rejects get the same "check your email"
 * answer, and the email itself explains why they can't sign in.
 */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().min(3).max(254))

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/**
 * Only allow same-origin relative redirects. Control characters and
 * backslashes are rejected (browsers strip tabs/newlines, so "/\t/evil.com"
 * would become "//evil.com"), and the result must resolve to our own origin.
 */
export function safeRedirect(path: string | null | undefined, fallback = "/"): string {
  if (!path || typeof path !== "string" || path.length > 2000) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return fallback
  if (!path.startsWith("/") || path.startsWith("//")) return fallback
  try {
    const base = new URL("http://dispatch.invalid")
    const url = new URL(path, base)
    if (url.origin !== base.origin) return fallback
    // URL parsing collapses dot segments ("/.//evil.com" → "//evil.com"): validate the *result* too
    const result = url.pathname + url.search + url.hash
    if (!result.startsWith("/") || result.startsWith("//") || result.startsWith("/\\")) return fallback
    return result
  } catch {
    return fallback
  }
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
  // A workspace that auto-admits this email domain acts like a standing invitation
  const domainPart = email.split("@")[1] ?? ""
  if (domainPart && (await hasAutoJoinWorkspace(domainPart))) return { allowed: true, existing: false }
  if (auth.signupMode === "domains") {
    const domain = email.split("@")[1] ?? ""
    const ok = auth.allowedSignupDomains.map((d) => d.toLowerCase().replace(/^@/, "")).includes(domain)
    return ok ? { allowed: true, existing: false } : { allowed: false, existing: false, reason: "domain" }
  }
  return { allowed: false, existing: false, reason: "invite_only" }
}

/**
 * Is there an active workspace that auto-admits members with this email
 * domain? The domain must belong to one of that workspace's admins (same rule
 * as `joinWorkspacesByEmailDomain`), so nobody can open sign-ups for a domain
 * they don't control. Public email providers never qualify, and in SaaS mode
 * the domain must be approved by a super admin.
 */
export async function hasAutoJoinWorkspace(domain: string): Promise<boolean> {
  const d = domain.toLowerCase()
  if (isPublicEmailDomain(d)) return false
  const approved = await approvedAutoJoinDomains()
  if (approved && !approved.has(d)) return false
  const rows = await db.execute<{ id: string }>(sql`
    select o.id from organizations o
    where o.suspended_at is null
      and (o.settings->>'autoJoinDomains')::boolean is true
      and o.settings->'allowedDomains' ? ${d}
      and exists (
        select 1 from memberships m
        join users u on u.id = m.user_id
        join roles r on r.id = m.role_id
        where m.org_id = o.id and m.status = 'active' and u.status = 'active'
          and (r.key = 'owner' or 'settings.manage' = any(r.permissions))
          and lower(split_part(u.email, '@', 2)) = ${d}
      )
    limit 1`)
  return rows.length > 0
}

export type RequestResult =
  | { ok: true; delivered: boolean }
  | { ok: false; error: "rate_limited" | "invalid_email"; message: string }

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
    // Same answer as a successful request (no account enumeration); the mailbox owner learns why by email
    return { ok: true, delivered: await sendAccessDeniedEmail(email, policy.reason) }
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

/**
 * Tell the owner of an address why no sign-in link came. Sent on every
 * request, like a sign-in email (and under the same per-address and per-IP
 * limits), so the timing doesn't reveal which kind of email went out. Returns
 * what a sign-in email would have returned for `delivered`.
 */
async function sendAccessDeniedEmail(email: string, reason: string | undefined): Promise<boolean> {
  const [general, branding, auth] = await Promise.all([getSettings("general"), getSettings("branding"), getSettings("auth")])
  const productName = branding.productName || general.instanceName
  const explanation =
    reason === "disabled"
      ? "The account for this email address has been disabled. If you think this is a mistake, contact your administrator."
      : auth.signupMode === "domains"
        ? `This email address doesn't have an account on ${productName}, and new accounts are limited to approved email domains. Ask a workspace admin to invite you.`
        : `This email address doesn't have an account on ${productName}, and new accounts need an invitation. Ask a workspace admin to invite you.`
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  // Delivery errors propagate exactly like a failed sign-in email, so they can't tell the two apart either
  const res = await sendSystemEmail({
    to: email,
    subject: `Your sign-in request for ${productName}`,
    html: renderEmailLayout({
      productName,
      heading: "We couldn't sign you in",
      body: `<p style="margin:0">${esc(explanation)}</p>`,
      footer: `If you didn't try to sign in, you can safely ignore this email.<br/>Sent by ${esc(productName)} · ${esc(getAppUrl())}`,
    }),
    text: `We couldn't sign you in to ${productName}.\n\n${explanation}\n\nIf you didn't try to sign in, you can ignore this email.`,
  })
  return res.delivered
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
  // Only a brand-new account joins automatically; existing users choose their invitations (/onboarding?invitations=1)
  if (isNewUser) {
    await acceptPendingInvitationsForEmail(user.id, row.email)
    await joinWorkspacesByEmailDomain(user.id, row.email)
  }
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

  const emailLimit = await rateLimit(`code:email:${email}`, 30, 3600)
  if (!emailLimit.ok) return { ok: false, error: "Too many attempts. Please try again later." }
  if ((await recentCodeFailures(email)) >= MAX_CODE_FAILURES_PER_DAY) {
    return { ok: false, error: "Too many incorrect codes today. Use the sign-in link in the email instead." }
  }

  // One answer for "no code was sent", "expired", "used up" and "wrong", so the
  // code form can't tell addresses with an account from those without
  const invalid = async (): Promise<VerifyResult> => {
    await rateLimit(codeFailureKey(email), MAX_CODE_FAILURES_PER_DAY, 86_400)
    return { ok: false, error: "That code isn't right or has expired. Check the email or request a new code." }
  }
  const row = await db.query.loginTokens.findFirst({
    where: and(eq(schema.loginTokens.email, email), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())),
    orderBy: desc(schema.loginTokens.createdAt),
  })
  if (!row) return invalid()
  // Claim an attempt atomically *before* comparing, so parallel guesses can't exceed the limit
  const [claimed] = await db
    .update(schema.loginTokens)
    .set({ attempts: sql`${schema.loginTokens.attempts} + 1` })
    .where(and(eq(schema.loginTokens.id, row.id), isNull(schema.loginTokens.usedAt), lt(schema.loginTokens.attempts, 5)))
    .returning({ id: schema.loginTokens.id })
  if (!claimed) return invalid()
  if (!safeEqual(row.codeHash, hmac(`${email}:${cleaned}`, "login-code"))) return invalid()
  return completeLogin(row)
}

/** Wrong codes per email per day: caps guessing at 20/day (the sign-in link keeps working). */
const MAX_CODE_FAILURES_PER_DAY = 20
const codeFailureKey = (email: string) => `code:fail:${email}`

async function recentCodeFailures(email: string): Promise<number> {
  const rows = await db.execute<{ count: number }>(
    sql`select count from rate_limits where key = ${codeFailureKey(email)} and reset_at > now()`
  )
  return Number(rows[0]?.count ?? 0)
}
