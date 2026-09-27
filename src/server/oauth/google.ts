import "server-only"
import { OAuthError, postTokenRequest, type OAuthClientConfig, type OAuthPurpose, type TokenResponse } from "./common"

/** Google OAuth 2.0 (Sign in with Google + Gmail IMAP/SMTP via XOAUTH2). */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

export const GOOGLE_MAIL_SCOPE = "https://mail.google.com/"

export const GOOGLE_MAIL_SERVERS = {
  imap: { host: "imap.gmail.com", port: 993, secure: true },
  smtp: { host: "smtp.gmail.com", port: 465, secure: true },
} as const

export function googleScopes(purpose: OAuthPurpose) {
  return purpose === "connect" ? `openid email profile ${GOOGLE_MAIL_SCOPE}` : "openid email profile"
}

export function googleAuthorizationUrl(opts: {
  cfg: OAuthClientConfig
  redirectUri: string
  purpose: OAuthPurpose
  state: string
  nonce: string
  codeChallenge: string
  loginHint?: string | null
}) {
  const params = new URLSearchParams({
    client_id: opts.cfg.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: googleScopes(opts.purpose),
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    include_granted_scopes: "true",
  })
  if (opts.purpose === "connect") {
    // offline + consent => Google always returns a refresh token
    params.set("access_type", "offline")
    params.set("prompt", "consent")
  } else {
    params.set("prompt", "select_account")
  }
  if (opts.loginHint) params.set("login_hint", opts.loginHint)
  return `${AUTH_URL}?${params.toString()}`
}

export function exchangeGoogleCode(opts: { cfg: OAuthClientConfig; code: string; codeVerifier: string; redirectUri: string }) {
  return postTokenRequest(TOKEN_URL, {
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
    client_id: opts.cfg.clientId,
    client_secret: opts.cfg.clientSecret,
  })
}

export async function refreshGoogleToken(cfg: OAuthClientConfig, refreshToken: string): Promise<TokenResponse> {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new OAuthError("Google OAuth is not configured on this instance (Admin → OAuth).", "not_configured")
  }
  return postTokenRequest(TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  })
}

export function hasGmailScope(scope: string | undefined) {
  return Boolean(scope?.split(/\s+/).includes(GOOGLE_MAIL_SCOPE))
}
