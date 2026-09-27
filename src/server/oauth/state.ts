import "server-only"
import crypto from "node:crypto"
import { randomToken, safeEqual, sign, unsign } from "@/server/crypto"
import { isSecureContext } from "@/server/env"
import type { OAuthProviderId, OAuthPurpose } from "./common"

/**
 * OAuth request binding:
 *  - `state` (sent through the provider) is a signed, expiring payload
 *  - the PKCE verifier and a nonce live in a signed httpOnly cookie
 *  - the callback requires both and matching nonces, so a callback URL can't
 *    be replayed in another browser (login CSRF) or after 10 minutes
 */

export const OAUTH_COOKIE = "dispatch_oauth"
const TTL_MS = 10 * 60_000

export type OAuthStatePayload = {
  provider: OAuthProviderId
  purpose: OAuthPurpose
  /** workspace slug (connect) */
  org?: string | null
  /** connect a shared inbox (true) or a personal one (false) */
  shared?: boolean
  teamId?: string | null
  /** login: where to go afterwards (relative path) */
  next?: string | null
  nonce: string
  exp: number
}

type CookiePayload = { nonce: string; v: string; p: OAuthProviderId; exp: number }

const encode = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64url")
function decode<T>(v: string): T | null {
  try {
    return JSON.parse(Buffer.from(v, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

export function createOAuthRequest(input: Omit<OAuthStatePayload, "nonce" | "exp">) {
  const nonce = randomToken(16)
  const codeVerifier = randomToken(48)
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")
  const exp = Date.now() + TTL_MS
  const state = sign(encode({ ...input, nonce, exp } satisfies OAuthStatePayload), "oauth-state")
  const cookie = sign(encode({ nonce, v: codeVerifier, p: input.provider, exp } satisfies CookiePayload), "oauth-cookie")
  return { state, cookie, nonce, codeChallenge }
}

export function verifyOAuthCallback(
  provider: OAuthProviderId,
  stateParam: string | null,
  cookieValue: string | undefined
): { payload: OAuthStatePayload; codeVerifier: string } | null {
  if (!stateParam || !cookieValue || stateParam.length > 4096 || cookieValue.length > 4096) return null
  const rawState = unsign(stateParam, "oauth-state")
  const rawCookie = unsign(cookieValue, "oauth-cookie")
  if (!rawState || !rawCookie) return null
  const payload = decode<OAuthStatePayload>(rawState)
  const cookie = decode<CookiePayload>(rawCookie)
  if (!payload || !cookie) return null
  const now = Date.now()
  if (payload.exp < now || cookie.exp < now) return null
  if (payload.provider !== provider || cookie.p !== provider) return null
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, String(cookie.nonce))) return null
  return { payload, codeVerifier: cookie.v }
}

export function oauthCookieOptions(maxAgeSeconds = TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: isSecureContext(),
    // Lax: sent on the top-level GET redirect back from the identity provider
    sameSite: "lax" as const,
    path: "/api/oauth",
    maxAge: maxAgeSeconds,
  }
}
