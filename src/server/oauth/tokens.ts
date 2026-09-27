import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { decryptCredentials, encryptCredentials, type AccountCredentials } from "@/server/mail/credentials"
import { getOAuthClientConfig, OAuthError } from "./common"
import { refreshGoogleToken } from "./google"
import { refreshMicrosoftToken } from "./microsoft"

/**
 * Access tokens for OAuth-connected mailboxes (XOAUTH2 for IMAP/SMTP).
 * Tokens are refreshed shortly before expiry and the new tokens are persisted
 * (encrypted) on the account. Concurrent callers in the same process share a
 * single refresh.
 */

const REFRESH_MARGIN_MS = 2 * 60_000
const inflight = new Map<string, Promise<string>>()

export class OAuthReauthRequiredError extends OAuthError {
  constructor(message = "Access to this mailbox was revoked or has expired. Reconnect the inbox to continue syncing.") {
    super(message, "reauth_required")
  }
}

export async function getAccountAccessToken(accountId: string, opts: { force?: boolean } = {}): Promise<string> {
  const pending = inflight.get(accountId)
  if (pending) return pending
  const p = loadOrRefresh(accountId, Boolean(opts.force)).finally(() => inflight.delete(accountId))
  inflight.set(accountId, p)
  return p
}

async function loadOrRefresh(accountId: string, force: boolean): Promise<string> {
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.id, accountId),
    columns: { id: true, credentialsEnc: true },
  })
  if (!account) throw new OAuthError("Inbox not found.", "not_found")
  const creds = decryptCredentials(account.credentialsEnc)
  const oauth = creds.oauth
  if (!oauth?.accessToken) throw new OAuthError("This inbox has no OAuth credentials.", "not_oauth")

  if (!force && oauth.expiresAt && oauth.expiresAt - REFRESH_MARGIN_MS > Date.now()) return oauth.accessToken
  if (!oauth.refreshToken) {
    // No refresh token: use the current token until it is rejected.
    if (!oauth.expiresAt || oauth.expiresAt > Date.now()) return oauth.accessToken
    throw new OAuthReauthRequiredError()
  }

  const cfg = await getOAuthClientConfig(oauth.provider)
  let token
  try {
    token =
      oauth.provider === "google"
        ? await refreshGoogleToken(cfg, oauth.refreshToken)
        : await refreshMicrosoftToken(cfg, oauth.refreshToken)
  } catch (err) {
    if (err instanceof OAuthError && (err.code === "invalid_grant" || err.code === "unauthorized_client")) {
      throw new OAuthReauthRequiredError()
    }
    throw err
  }

  const next: AccountCredentials = {
    ...creds,
    oauth: {
      ...oauth,
      accessToken: token.access_token,
      // Microsoft rotates refresh tokens; Google keeps the original one.
      refreshToken: token.refresh_token || oauth.refreshToken,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      scope: token.scope || oauth.scope,
    },
  }
  await db
    .update(schema.accounts)
    .set({ credentialsEnc: encryptCredentials(next) })
    .where(eq(schema.accounts.id, accountId))
  return token.access_token
}
