import "server-only"
import { getSettings, readSecret } from "@/server/settings"
import { getAppUrl } from "@/server/env"

/**
 * Shared OAuth 2.0 / OpenID Connect plumbing for Google and Microsoft.
 * Client credentials are configured by the super admin in Admin → OAuth.
 */

export type OAuthProviderId = "google" | "microsoft"
export type OAuthPurpose = "connect" | "login"

export const OAUTH_PROVIDERS: OAuthProviderId[] = ["google", "microsoft"]

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return (OAUTH_PROVIDERS as string[]).includes(value)
}

export class OAuthError extends Error {
  constructor(
    message: string,
    /** "invalid_grant" => refresh token revoked/expired, user must reconnect */
    public code = "oauth_error",
    public status?: number
  ) {
    super(message)
  }
}

export type OAuthClientConfig = {
  provider: OAuthProviderId
  enabled: boolean
  clientId: string
  clientSecret: string
  /** Microsoft only: "common" | "organizations" | "consumers" | <tenant id> */
  tenant: string
}

export async function getOAuthClientConfig(provider: OAuthProviderId): Promise<OAuthClientConfig> {
  const cfg = await getSettings("oauth")
  if (provider === "google") {
    return {
      provider,
      enabled: cfg.google.enabled,
      clientId: cfg.google.clientId.trim(),
      clientSecret: readSecret(cfg.google.clientSecretEnc) ?? "",
      tenant: "",
    }
  }
  return {
    provider,
    enabled: cfg.microsoft.enabled,
    clientId: cfg.microsoft.clientId.trim(),
    clientSecret: readSecret(cfg.microsoft.clientSecretEnc) ?? "",
    tenant: cfg.microsoft.tenant.trim() || "common",
  }
}

export function isConfigured(cfg: OAuthClientConfig) {
  return cfg.enabled && Boolean(cfg.clientId && cfg.clientSecret)
}

/** The redirect URI to register in the Google Cloud / Microsoft Entra console. */
export function oauthRedirectUri(provider: OAuthProviderId) {
  return `${getAppUrl()}/api/oauth/${provider}/callback`
}

export type TokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  id_token?: string
}

/** POST an application/x-www-form-urlencoded token request. */
export async function postTokenRequest(url: string, params: Record<string, string>): Promise<TokenResponse> {
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new OAuthError(`Could not reach the identity provider: ${err instanceof Error ? err.message : String(err)}`, "network")
  }
  const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    const code = body.error || "token_error"
    const description = body.error_description?.split("\r\n")[0] || `Token request failed (HTTP ${res.status})`
    throw new OAuthError(description, code, res.status)
  }
  return body as TokenResponse
}

export type IdTokenClaims = {
  iss?: string
  aud?: string | string[]
  sub?: string
  exp?: number
  nonce?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  picture?: string
  preferred_username?: string
  tid?: string
  oid?: string
  xms_edov?: boolean | string
  hd?: string
}

/**
 * Decode an ID token received directly from the token endpoint over TLS.
 * Per OIDC Core §3.1.3.7 the TLS server validation substitutes for the
 * signature check in the code flow; we still validate aud, exp and nonce.
 */
export function decodeIdToken(idToken: string | undefined, expect: { clientId: string; nonce: string }): IdTokenClaims {
  if (!idToken) throw new OAuthError("The identity provider did not return an ID token.", "missing_id_token")
  const parts = idToken.split(".")
  if (parts.length < 2) throw new OAuthError("Malformed ID token.", "invalid_id_token")
  let claims: IdTokenClaims
  try {
    claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as IdTokenClaims
  } catch {
    throw new OAuthError("Malformed ID token.", "invalid_id_token")
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(expect.clientId)) throw new OAuthError("ID token audience mismatch.", "invalid_id_token")
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new OAuthError("ID token expired.", "invalid_id_token")
  if (claims.nonce !== expect.nonce) throw new OAuthError("ID token nonce mismatch.", "invalid_id_token")
  return claims
}

export const isTrue = (v: boolean | string | undefined) => v === true || v === "true"
