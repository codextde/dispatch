import "server-only"
import { OAuthError, postTokenRequest, type OAuthClientConfig, type OAuthPurpose, type TokenResponse } from "./common"

/** Microsoft identity platform (Entra ID / Microsoft 365 / Outlook.com). */

const authority = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant || "common")}/oauth2/v2.0`

export const MICROSOFT_MAIL_SCOPES = [
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "https://outlook.office.com/SMTP.Send",
]

export const MICROSOFT_MAIL_SERVERS = {
  imap: { host: "outlook.office365.com", port: 993, secure: true },
  smtp: { host: "smtp.office365.com", port: 587, secure: false },
} as const

/** Personal Microsoft accounts (outlook.com, hotmail.com) live in this tenant. */
export const MSA_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"

export function microsoftScopes(purpose: OAuthPurpose) {
  return purpose === "connect"
    ? ["openid", "email", "profile", "offline_access", ...MICROSOFT_MAIL_SCOPES].join(" ")
    : "openid email profile"
}

export function microsoftAuthorizationUrl(opts: {
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
    response_mode: "query",
    scope: microsoftScopes(opts.purpose),
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  })
  if (opts.loginHint) params.set("login_hint", opts.loginHint)
  return `${authority(opts.cfg.tenant)}/authorize?${params.toString()}`
}

export function exchangeMicrosoftCode(opts: {
  cfg: OAuthClientConfig
  code: string
  codeVerifier: string
  redirectUri: string
  purpose: OAuthPurpose
}) {
  return postTokenRequest(`${authority(opts.cfg.tenant)}/token`, {
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
    client_id: opts.cfg.clientId,
    client_secret: opts.cfg.clientSecret,
    scope: microsoftScopes(opts.purpose),
  })
}

export async function refreshMicrosoftToken(cfg: OAuthClientConfig, refreshToken: string): Promise<TokenResponse> {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new OAuthError("Microsoft OAuth is not configured on this instance (Admin → OAuth).", "not_configured")
  }
  return postTokenRequest(`${authority(cfg.tenant)}/token`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: ["offline_access", ...MICROSOFT_MAIL_SCOPES].join(" "),
  })
}
