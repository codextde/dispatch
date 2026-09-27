import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"
import { loadOrgContext, type OrgContext } from "@/server/authz"
import { createSession, SESSION_COOKIE, sessionCookieOptions, validateSessionToken } from "@/server/auth/session"
import { canEmailAuthenticate, safeRedirect } from "@/server/auth/magic-link"
import { acceptPendingInvitationsForEmail, resolveLoginHomePath } from "@/server/orgs"
import { joinWorkspacesByEmailDomain } from "@/server/workspace/auto-join"
import { sign } from "@/server/crypto"
import { ipFromHeaders } from "@/server/request"
import { audit } from "@/server/audit"
import { enqueueJob } from "@/server/jobs"
import { publish } from "@/server/realtime"
import { decryptCredentials, encryptCredentials, type AccountCredentials } from "@/server/mail/credentials"
import {
  decodeIdToken,
  getOAuthClientConfig,
  isConfigured,
  isOAuthProvider,
  isTrue,
  OAuthError,
  oauthRedirectUri,
  type IdTokenClaims,
  type OAuthProviderId,
  type OAuthPurpose,
  type TokenResponse,
} from "./common"
import { exchangeGoogleCode, GOOGLE_MAIL_SERVERS, googleAuthorizationUrl, hasGmailScope } from "./google"
import { exchangeMicrosoftCode, MICROSOFT_MAIL_SERVERS, microsoftAuthorizationUrl, MSA_CONSUMER_TENANT } from "./microsoft"
import { createOAuthRequest, OAUTH_COOKIE, oauthCookieOptions, verifyOAuthCallback, type OAuthStatePayload } from "./state"

/**
 * "Sign in with Google / Microsoft" and "Connect Gmail / Microsoft 365"
 * (route handlers: /api/oauth/[provider]/start and /callback).
 */

const PROVIDER_LABEL: Record<OAuthProviderId, string> = { google: "Google", microsoft: "Microsoft" }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9-]{1,64}$/

class FlowError extends Error {}

function absolute(path: string) {
  return new URL(path, getAppUrl())
}

function errorTarget(purpose: OAuthPurpose, org: string | null | undefined, message: string) {
  const text = message.slice(0, 300)
  if (purpose === "connect" && org && SLUG_RE.test(org)) return `/w/${org}/settings/inboxes?error=${encodeURIComponent(text)}`
  // The login page only renders server-signed messages (prevents text injection via crafted links)
  return `/login?error=${encodeURIComponent(sign(text, "login-error"))}`
}

function redirectTo(path: string, opts: { clearOAuthCookie?: boolean } = {}) {
  const res = NextResponse.redirect(absolute(path), 303)
  if (opts.clearOAuthCookie) res.cookies.set(OAUTH_COOKIE, "", oauthCookieOptions(0))
  res.headers.set("Cache-Control", "no-store")
  return res
}

async function requireConnectContext(req: NextRequest, slug: string, shared: boolean): Promise<OrgContext> {
  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) throw new FlowError("Please sign in again to connect an inbox.")
  const ctx = await loadOrgContext(slug)
  if (!ctx) throw new FlowError("Workspace not found.")
  // Mailbox credentials outlive an impersonation session: never connect them from one
  if (ctx.session.impersonatorId) throw new FlowError("You can't connect mailboxes while impersonating this user.")
  if (ctx.locked) throw new FlowError(ctx.locked.message)
  const permission = shared ? "inboxes.manage" : "inboxes.connect_personal"
  if (!ctx.permissions.has(permission)) {
    throw new FlowError(shared ? "You don't have permission to connect shared inboxes." : "You don't have permission to connect personal inboxes.")
  }
  return ctx
}

/* ---------------------------------- Start ---------------------------------- */

export async function startOAuth(req: NextRequest, providerParam: string): Promise<NextResponse> {
  const q = req.nextUrl.searchParams
  const purpose: OAuthPurpose = q.get("purpose") === "connect" ? "connect" : "login"
  const org = q.get("org")?.toLowerCase() ?? null
  try {
    if (!isOAuthProvider(providerParam)) throw new FlowError("Unknown sign-in provider.")
    const provider = providerParam
    const cfg = await getOAuthClientConfig(provider)
    if (!isConfigured(cfg)) throw new FlowError(`${PROVIDER_LABEL[provider]} sign-in is not configured on this instance.`)

    const shared = q.get("shared") === "1" || q.get("shared") === "true"
    let teamId: string | null = null
    let next: string | null = null
    if (purpose === "login") {
      const auth = await getSettings("auth")
      const enabled = provider === "google" ? auth.googleLogin : auth.microsoftLogin
      if (!enabled) throw new FlowError(`Sign in with ${PROVIDER_LABEL[provider]} is disabled.`)
      next = safeRedirect(q.get("next"), "") || null
    } else {
      if (!org || !SLUG_RE.test(org)) throw new FlowError("Missing workspace.")
      const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
      if (!session) {
        const back = `${req.nextUrl.pathname}${req.nextUrl.search}`
        return redirectTo(`/login?next=${encodeURIComponent(back)}`)
      }
      const ctx = await requireConnectContext(req, org, shared)
      const t = q.get("teamId")
      if (shared && t && UUID_RE.test(t)) {
        const team = await db.query.teams.findFirst({
          where: and(eq(schema.teams.id, t), eq(schema.teams.orgId, ctx.org.id)),
          columns: { id: true },
        })
        teamId = team?.id ?? null
      }
    }

    const request = createOAuthRequest({ provider, purpose, org, shared, teamId, next })
    const common = {
      cfg,
      redirectUri: oauthRedirectUri(provider),
      purpose,
      state: request.state,
      nonce: request.nonce,
      codeChallenge: request.codeChallenge,
      loginHint: q.get("login_hint"),
    }
    const url = provider === "google" ? googleAuthorizationUrl(common) : microsoftAuthorizationUrl(common)
    const res = NextResponse.redirect(url, 302)
    res.cookies.set(OAUTH_COOKIE, request.cookie, oauthCookieOptions())
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (err) {
    const message = err instanceof FlowError || err instanceof OAuthError ? err.message : "Could not start sign-in."
    if (!(err instanceof FlowError)) console.error("[oauth] start failed", err)
    return redirectTo(errorTarget(purpose, org, message))
  }
}

/* --------------------------------- Callback -------------------------------- */

export async function handleOAuthCallback(req: NextRequest, providerParam: string): Promise<NextResponse> {
  const q = req.nextUrl.searchParams
  if (!isOAuthProvider(providerParam)) return redirectTo(errorTarget("login", null, "Unknown sign-in provider."), { clearOAuthCookie: true })
  const provider = providerParam
  const verified = verifyOAuthCallback(provider, q.get("state"), req.cookies.get(OAUTH_COOKIE)?.value)
  if (!verified) {
    return redirectTo(errorTarget("login", null, "This sign-in link has expired or was opened in another browser. Please try again."), {
      clearOAuthCookie: true,
    })
  }
  const { payload, codeVerifier } = verified

  try {
    const providerError = q.get("error")
    if (providerError) {
      throw new FlowError(
        providerError === "access_denied"
          ? `${PROVIDER_LABEL[provider]} sign-in was cancelled.`
          : q.get("error_description")?.split(/\r?\n/)[0]?.slice(0, 200) || `${PROVIDER_LABEL[provider]} returned an error (${providerError}).`
      )
    }
    const code = q.get("code")
    if (!code) throw new FlowError("Missing authorization code.")

    const cfg = await getOAuthClientConfig(provider)
    if (!isConfigured(cfg)) throw new FlowError(`${PROVIDER_LABEL[provider]} sign-in is not configured on this instance.`)
    const redirectUri = oauthRedirectUri(provider)
    const tokens =
      provider === "google"
        ? await exchangeGoogleCode({ cfg, code, codeVerifier, redirectUri })
        : await exchangeMicrosoftCode({ cfg, code, codeVerifier, redirectUri, purpose: payload.purpose })
    const claims = decodeIdToken(tokens.id_token, { clientId: cfg.clientId, nonce: payload.nonce })

    const target =
      payload.purpose === "connect"
        ? await completeConnect(req, provider, payload, tokens, claims)
        : await completeLogin(req, provider, payload, claims)
    const res = redirectTo(target.path, { clearOAuthCookie: true })
    if (target.sessionToken) res.cookies.set(SESSION_COOKIE, target.sessionToken, sessionCookieOptions())
    return res
  } catch (err) {
    const message = err instanceof FlowError || err instanceof OAuthError ? err.message : "Sign-in failed. Please try again."
    if (!(err instanceof FlowError)) console.error("[oauth] callback failed", err)
    return redirectTo(errorTarget(payload.purpose, payload.org, message), { clearOAuthCookie: true })
  }
}

function normalize(email: string | undefined | null) {
  const e = (email ?? "").trim().toLowerCase()
  return e.includes("@") ? e : null
}

/**
 * Verified email address of the signed-in identity (login).
 * Microsoft: `preferred_username` is mutable and not meant for authorization,
 * so only the `email` claim counts, and only when Entra marks its domain as
 * verified (`xms_edov`) or the account is a personal Microsoft account (whose
 * addresses Microsoft verifies).
 */
export function verifiedEmail(provider: OAuthProviderId, claims: IdTokenClaims): string | null {
  if (provider === "google") return isTrue(claims.email_verified) ? normalize(claims.email) : null
  const verified = isTrue(claims.xms_edov) || claims.tid?.toLowerCase() === MSA_CONSUMER_TENANT
  return verified ? normalize(claims.email) : null
}

/** Stable Microsoft account id: tenant id + object id (never the UPN or email). */
export function microsoftSubject(claims: IdTokenClaims): string | null {
  const tid = claims.tid?.toLowerCase()
  const oid = claims.oid?.toLowerCase()
  return tid && oid && UUID_RE.test(tid) && UUID_RE.test(oid) ? `${tid}:${oid}` : null
}

/* ------------------------------- Connect inbox ------------------------------ */

async function completeConnect(
  req: NextRequest,
  provider: OAuthProviderId,
  payload: OAuthStatePayload,
  tokens: TokenResponse,
  claims: IdTokenClaims
): Promise<{ path: string; sessionToken?: string }> {
  if (!payload.org) throw new FlowError("Missing workspace.")
  const shared = Boolean(payload.shared)
  const ctx = await requireConnectContext(req, payload.org, shared)

  // Microsoft: the sign-in name (UPN) is the mailbox address IMAP/SMTP authenticate as;
  // the optional `email` claim is not verified by Entra
  const email =
    provider === "google"
      ? isTrue(claims.email_verified)
        ? normalize(claims.email)
        : null
      : (normalize(claims.preferred_username) ?? normalize(claims.email))
  if (!email) throw new FlowError(`${PROVIDER_LABEL[provider]} did not return a verified email address for this mailbox.`)
  if (provider === "google" && !hasGmailScope(tokens.scope)) {
    throw new FlowError("Gmail access was not granted. Please allow Dispatch to read, send and manage your email.")
  }
  if (!tokens.refresh_token) {
    throw new FlowError(`${PROVIDER_LABEL[provider]} did not return offline access. Remove Dispatch from your account's connected apps and try again.`)
  }

  const servers = provider === "google" ? GOOGLE_MAIL_SERVERS : MICROSOFT_MAIL_SERVERS
  const accountProvider = provider === "google" ? "gmail" : "outlook"
  const mailboxUser = email
  const credentials: AccountCredentials = {
    imap: { ...servers.imap, user: mailboxUser },
    smtp: { ...servers.smtp, user: mailboxUser },
    oauth: {
      provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      scope: tokens.scope,
    },
  }

  const a = schema.accounts
  const [existing] = await db
    .select()
    .from(a)
    .where(
      and(
        eq(a.orgId, ctx.org.id),
        sql`lower(${a.email}) = ${email}`,
        shared ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)
      )
    )
    .limit(1)

  let accountId: string
  if (existing) {
    // Reconnect: keep settings, replace credentials
    const previous = decryptCredentials(existing.credentialsEnc)
    await db
      .update(a)
      .set({
        provider: accountProvider,
        credentialsEnc: encryptCredentials({ ...previous, ...credentials }),
        status: existing.status === "paused" ? "paused" : "pending",
        lastError: null,
      })
      .where(eq(a.id, existing.id))
    accountId = existing.id
  } else {
    const days = 30
    const [row] = await db
      .insert(a)
      .values({
        orgId: ctx.org.id,
        ownerUserId: shared ? null : ctx.user.id,
        teamId: shared ? (payload.teamId ?? null) : null,
        provider: accountProvider,
        name: shared ? email : claims.name?.trim() || email,
        email,
        fromName: shared ? null : claims.name?.trim() || null,
        credentialsEnc: encryptCredentials(credentials),
        config: {
          imapHost: servers.imap.host,
          imapPort: servers.imap.port,
          imapSecure: servers.imap.secure,
          smtpHost: servers.smtp.host,
          smtpPort: servers.smtp.port,
          smtpSecure: servers.smtp.secure,
          username: mailboxUser,
          inboxPath: "INBOX",
          syncDays: days,
          saveSentCopy: true,
        },
        status: "pending",
        syncFromDate: new Date(Date.now() - days * 86_400_000),
      })
      .returning({ id: a.id })
    accountId = row!.id
    if (shared && payload.teamId) {
      await db.insert(schema.accountAccess).values({ accountId, teamId: payload.teamId, level: "reply" })
    }
  }

  const meta = { ip: ipFromHeaders(req.headers), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null }
  await audit({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    actorEmail: ctx.user.email,
    action: existing ? "inbox.reconnected" : "inbox.connected",
    targetType: "account",
    targetId: accountId,
    metadata: { provider: accountProvider, email, shared },
    ...meta,
  })
  await enqueueJob("account.sync", { accountId })
  await publish({ orgId: ctx.org.id, type: "account.updated", actorId: ctx.user.id, data: { accountId } })
  return { path: `/w/${ctx.org.slug}/settings/inboxes?connected=${accountId}` }
}

/* ----------------------------------- Login ---------------------------------- */

async function completeLogin(
  req: NextRequest,
  provider: OAuthProviderId,
  payload: OAuthStatePayload,
  claims: IdTokenClaims
): Promise<{ path: string; sessionToken?: string }> {
  const auth = await getSettings("auth")
  if (!(provider === "google" ? auth.googleLogin : auth.microsoftLogin)) {
    throw new FlowError(`Sign in with ${PROVIDER_LABEL[provider]} is disabled.`)
  }

  // Microsoft: after the first sign-in the account is matched on (tid, oid), not on its email
  const subject = provider === "microsoft" ? microsoftSubject(claims) : null
  if (provider === "microsoft" && !subject) throw new FlowError("Microsoft didn't identify your account. Please sign in with your email instead.")
  const identity = subject
    ? await db.query.userIdentities.findFirst({
        where: and(eq(schema.userIdentities.provider, provider), eq(schema.userIdentities.subject, subject)),
      })
    : null
  let user = identity ? await db.query.users.findFirst({ where: eq(schema.users.id, identity.userId) }) : undefined

  const email = user ? user.email.toLowerCase() : verifiedEmail(provider, claims)
  if (!email) {
    throw new FlowError(
      provider === "microsoft"
        ? "Microsoft didn't confirm the email address of this account. Please sign in with your email instead."
        : `Your ${PROVIDER_LABEL[provider]} account has no verified email address.`
    )
  }

  const meta = { ip: ipFromHeaders(req.headers), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null }
  const policy = await canEmailAuthenticate(email)
  if (!policy.allowed) {
    await audit({ action: "auth.login_denied", actorEmail: email, metadata: { method: provider, reason: policy.reason }, ...meta })
    throw new FlowError(
      policy.reason === "disabled"
        ? "This account has been disabled. Contact your administrator."
        : policy.reason === "domain"
          ? "Sign-ups are restricted to approved email domains."
          : "This instance is invite-only. Ask a workspace admin to invite you."
    )
  }

  let isNewUser = false
  if (!user) {
    user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` })
    if (user?.isSuperAdmin && subject) {
      // Never hand a super admin account to a Microsoft identity on the strength of an email claim alone:
      // linking needs a session already signed in as that admin (e.g. via an email link)
      const current = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
      if (current?.user.id !== user.id || current.session.impersonatorId) {
        await audit({ action: "auth.login_denied", actorEmail: email, metadata: { method: provider, reason: "super_admin_link" }, ...meta })
        throw new FlowError("Administrator accounts can't be linked to Microsoft by email. Sign in with your email first, then continue with Microsoft.")
      }
    }
  }
  if (!user) {
    const [created] = await db
      .insert(schema.users)
      .values({
        email,
        name: claims.name?.trim() || null,
        avatarUrl: provider === "google" && claims.picture?.startsWith("https://") ? claims.picture : null,
      })
      .onConflictDoNothing()
      .returning()
    user = created ?? (await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` }))
    isNewUser = Boolean(created)
  } else if (!user.name && claims.name?.trim()) {
    await db.update(schema.users).set({ name: claims.name.trim() }).where(eq(schema.users.id, user.id))
  }
  if (!user) throw new FlowError("Could not create your account.")
  if (user.status !== "active") throw new FlowError("This account has been disabled. Contact your administrator.")

  if (subject && identity) {
    await db.update(schema.userIdentities).set({ lastUsedAt: new Date() }).where(eq(schema.userIdentities.id, identity.id))
  } else if (subject) {
    await db
      .insert(schema.userIdentities)
      .values({ userId: user.id, provider, subject, email })
      .onConflictDoNothing()
    await audit({ actorId: user.id, actorEmail: email, action: "auth.identity_linked", metadata: { provider }, ...meta })
  }

  // Only a brand-new account joins automatically; existing users choose their invitations
  if (isNewUser) {
    await acceptPendingInvitationsForEmail(user.id, email)
    await joinWorkspacesByEmailDomain(user.id, email)
  }
  const { token } = await createSession(user.id, meta)
  await audit({ actorId: user.id, actorEmail: email, action: "auth.login", metadata: { method: provider, newUser: isNewUser }, ...meta })
  const path = safeRedirect(payload.next, "") || (await resolveLoginHomePath(user, isNewUser))
  return { path, sessionToken: token }
}
