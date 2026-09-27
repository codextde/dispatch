import "server-only"
import net from "node:net"
import { ImapFlow, type ImapFlowOptions, type ListResponse } from "imapflow"
import nodemailer, { type Transporter } from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"
import type { Account, AccountConfig } from "@/server/db/schema"
import { decryptCredentials, type ImapCredentials, type SmtpCredentials } from "./credentials"
import { BlockedHostError, isPrivateHost, resolveConnectTarget } from "./net-guard"
import { getAccountAccessToken, OAuthReauthRequiredError } from "@/server/oauth/tokens"
import { GOOGLE_MAIL_SERVERS } from "@/server/oauth/google"
import { MICROSOFT_MAIL_SERVERS } from "@/server/oauth/microsoft"

/**
 * IMAP / SMTP connections for connected mailboxes.
 *
 *  - `testImap` / `testSmtp`: used by the "Connect inbox" form
 *  - `createImapClient` / `createSmtpTransport`: used by the worker for a
 *    stored account (password or XOAUTH2 with automatic token refresh)
 *
 * All connections honour the SSRF guard (Admin → Security → Block private
 * networks) and use short timeouts so a bad host never hangs a request.
 */

export const CONNECT_TIMEOUT_MS = 15_000

export type MailboxInfo = { path: string; name: string; specialUse?: string }

export type TestImapResult = { ok: true; mailboxes: MailboxInfo[] } | { ok: false; error: string }
export type TestSmtpResult = { ok: true } | { ok: false; error: string }

type Endpoint = { host: string; port: number; secure: boolean }

/** Well-known ports imply the TLS mode; fix the common "SSL on 587" mistake. */
function normalizeSecure(kind: "imap" | "smtp", ep: Endpoint): boolean {
  if (kind === "imap") {
    if (ep.port === 993) return true
    if (ep.port === 143) return false
  } else {
    if (ep.port === 465) return true
    if (ep.port === 587 || ep.port === 25 || ep.port === 2525) return false
  }
  return ep.secure
}

async function connectTarget(host: string) {
  const target = await resolveConnectTarget(host)
  const bare = host.replace(/^\[|\]$/g, "")
  return {
    host: target?.address ?? bare,
    // Keep TLS verification (and SNI) bound to the hostname when pinned to an IP
    servername: target && !net.isIP(bare) ? bare : undefined,
    // Cleartext is only acceptable inside a private network; public servers must
    // upgrade with STARTTLS (otherwise a MITM could strip it and read the password)
    requireStartTls: target ? true : !(await isPrivateHost(bare)),
  }
}

/* ---------------------------------- IMAP ---------------------------------- */

type ImapAuth = { user: string; pass?: string; accessToken?: string }

async function imapOptions(ep: Endpoint, auth: ImapAuth, extra: Partial<ImapFlowOptions> = {}): Promise<ImapFlowOptions> {
  const target = await connectTarget(ep.host)
  const secure = normalizeSecure("imap", ep)
  return {
    host: target.host,
    servername: target.servername,
    port: ep.port,
    secure,
    ...(!secure && target.requireStartTls ? { doSTARTTLS: true } : {}),
    auth: auth.accessToken ? { user: auth.user, accessToken: auth.accessToken } : { user: auth.user, pass: auth.pass ?? "" },
    logger: false,
    clientInfo: { name: "Dispatch", vendor: "Dispatch" },
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 5 * 60_000,
    tls: { minVersion: "TLSv1.2" },
    ...extra,
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { code: "ETIMEDOUT" })), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/** Test IMAP credentials and list the account's mailboxes. */
export async function testImap(creds: ImapCredentials): Promise<TestImapResult> {
  if (!creds.host?.trim()) return { ok: false, error: "IMAP host is required." }
  if (!creds.user?.trim()) return { ok: false, error: "IMAP username is required." }
  let client: ImapFlow | null = null
  try {
    client = new ImapFlow(
      await imapOptions({ host: creds.host.trim(), port: creds.port, secure: creds.secure }, { user: creds.user.trim(), pass: creds.pass }, {
        disableAutoIdle: true,
        socketTimeout: 30_000,
      })
    )
    client.on("error", () => {})
    await withTimeout(client.connect(), CONNECT_TIMEOUT_MS + 5_000, "Connection timed out")
    const mailboxes = await withTimeout(listMailboxes(client), CONNECT_TIMEOUT_MS, "Listing mailboxes timed out")
    await client.logout().catch(() => {})
    return { ok: true, mailboxes }
  } catch (err) {
    return { ok: false, error: friendlyMailError(err, { kind: "imap", host: creds.host, port: creds.port }) }
  } finally {
    client?.close()
  }
}

/** Selectable mailboxes, INBOX and special-use folders first. */
export async function listMailboxes(client: ImapFlow): Promise<MailboxInfo[]> {
  const list: ListResponse[] = await client.list()
  const order = ["\\Inbox", "\\Sent", "\\Drafts", "\\Archive", "\\All", "\\Junk", "\\Trash"]
  return list
    .filter((m) => !hasFlag(m.flags, "\\Noselect") && !hasFlag(m.flags, "\\NonExistent"))
    .map((m) => {
      const isInbox = m.path.toUpperCase() === "INBOX"
      const specialUse = isInbox ? "\\Inbox" : m.specialUse
      return { path: isInbox ? "INBOX" : m.path, name: isInbox ? "Inbox" : m.name, ...(specialUse ? { specialUse } : {}) }
    })
    .sort((a, b) => {
      const ra = a.specialUse ? order.indexOf(a.specialUse) : order.length
      const rb = b.specialUse ? order.indexOf(b.specialUse) : order.length
      return ra - rb || a.path.localeCompare(b.path)
    })
}

function hasFlag(flags: Set<string> | undefined, flag: string) {
  if (!flags) return false
  for (const f of flags) if (f.toLowerCase() === flag.toLowerCase()) return true
  return false
}

export type MailboxPaths = {
  inbox: string
  sent: string | null
  archive: string | null
  trash: string | null
  junk: string | null
  drafts: string | null
  all: string | null
}

/**
 * Resolve the folders used by sync from the account config (explicit paths
 * chosen in the UI win) and special-use detection. On Gmail "All Mail" is
 * the archive.
 */
export function resolveMailboxPaths(config: AccountConfig, mailboxes: MailboxInfo[]): MailboxPaths {
  const exists = (p: string | undefined) => (p && mailboxes.some((m) => m.path === p) ? p : null)
  const byUse = (use: string) => mailboxes.find((m) => m.specialUse === use)?.path ?? null
  const all = byUse("\\All")
  return {
    inbox: exists(config.inboxPath) ?? "INBOX",
    sent: exists(config.sentPath) ?? byUse("\\Sent"),
    archive: exists(config.archivePath) ?? byUse("\\Archive") ?? all,
    trash: exists(config.trashPath) ?? byUse("\\Trash"),
    junk: exists(config.spamPath) ?? byUse("\\Junk"),
    drafts: byUse("\\Drafts"),
    all,
  }
}

type AccountLike = Pick<Account, "id" | "provider" | "email" | "credentialsEnc">

function endpointsFor(account: AccountLike) {
  const creds = decryptCredentials(account.credentialsEnc)
  const preset =
    account.provider === "gmail" ? GOOGLE_MAIL_SERVERS : account.provider === "outlook" ? MICROSOFT_MAIL_SERVERS : null
  const imap: ImapCredentials | undefined = creds.imap?.host
    ? creds.imap
    : preset
      ? { ...preset.imap, user: account.email }
      : undefined
  const smtp: SmtpCredentials | undefined = creds.smtp?.host
    ? creds.smtp
    : preset
      ? { ...preset.smtp, user: account.email }
      : undefined
  return { creds, imap, smtp }
}

export class MailConfigError extends Error {
  code = "ECONFIG"
}

async function authFor(account: AccountLike, user: string, pass: string | undefined, hasOAuth: boolean, force = false): Promise<ImapAuth> {
  if (hasOAuth) return { user: user || account.email, accessToken: await getAccountAccessToken(account.id, { force }) }
  return { user, pass }
}

/**
 * Build an (unconnected) IMAP client for a stored account. An `error`
 * listener is attached so connection errors never crash the process; attach
 * your own listeners before calling `connect()`.
 */
export async function createImapClient(
  account: AccountLike,
  extra: Partial<ImapFlowOptions> = {},
  opts: { forceTokenRefresh?: boolean } = {}
): Promise<ImapFlow> {
  const { creds, imap } = endpointsFor(account)
  if (!imap?.host) throw new MailConfigError("IMAP settings are missing for this inbox.")
  const auth = await authFor(account, imap.user, imap.pass, Boolean(creds.oauth), opts.forceTokenRefresh)
  const client = new ImapFlow(await imapOptions(imap, auth, { id: `acc-${account.id.slice(0, 8)}`, ...extra }))
  client.on("error", () => {})
  return client
}

/* ---------------------------------- SMTP ---------------------------------- */

async function smtpOptions(ep: Endpoint, auth: SMTPTransport.Options["auth"]): Promise<SMTPTransport.Options> {
  const target = await connectTarget(ep.host)
  const secure = normalizeSecure("smtp", ep)
  return {
    host: target.host,
    port: ep.port,
    secure,
    requireTLS: !secure && target.requireStartTls,
    auth,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 60_000,
    dnsTimeout: 10_000,
    tls: { minVersion: "TLSv1.2", ...(target.servername ? { servername: target.servername } : {}) },
  }
}

/** Test SMTP credentials (connect + authenticate, no mail is sent). */
export async function testSmtp(creds: SmtpCredentials): Promise<TestSmtpResult> {
  if (!creds.host?.trim()) return { ok: false, error: "SMTP host is required." }
  let transport: Transporter | null = null
  try {
    const auth = creds.user?.trim() ? { user: creds.user.trim(), pass: creds.pass ?? "" } : undefined
    transport = nodemailer.createTransport(
      await smtpOptions({ host: creds.host.trim(), port: creds.port, secure: creds.secure }, auth)
    )
    await withTimeout(transport.verify(), CONNECT_TIMEOUT_MS * 2, "Connection timed out")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: friendlyMailError(err, { kind: "smtp", host: creds.host, port: creds.port }) }
  } finally {
    transport?.close()
  }
}

/** Nodemailer transport for a stored account (password or XOAUTH2). */
export async function createSmtpTransport(
  account: AccountLike,
  opts: { forceTokenRefresh?: boolean } = {}
): Promise<Transporter<SMTPTransport.SentMessageInfo>> {
  const { creds, smtp } = endpointsFor(account)
  if (!smtp?.host) throw new MailConfigError("SMTP settings are missing for this inbox.")
  let auth: SMTPTransport.Options["auth"]
  if (creds.oauth) {
    const accessToken = await getAccountAccessToken(account.id, { force: opts.forceTokenRefresh })
    auth = { type: "OAuth2", user: smtp.user || account.email, accessToken }
  } else if (smtp.user) {
    auth = { user: smtp.user, pass: smtp.pass ?? "" }
  }
  return nodemailer.createTransport(await smtpOptions(smtp, auth))
}

/* ------------------------------ Error messages ----------------------------- */

type ErrLike = Error & {
  code?: string
  responseCode?: number
  response?: unknown
  responseText?: string
  serverResponseCode?: string
  authenticationFailed?: boolean
  tlsFailed?: boolean
  reason?: string
}

const CERT_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_NOT_YET_VALID",
])

/** Turn IMAP/SMTP/network errors into a short, actionable message for the UI. */
export function friendlyMailError(err: unknown, ctx: { kind: "imap" | "smtp"; host?: string; port?: number; oauth?: boolean }): string {
  if (err instanceof BlockedHostError || err instanceof OAuthReauthRequiredError || err instanceof MailConfigError) return err.message
  const e = (err ?? {}) as ErrLike
  // Drizzle wraps database errors with the full query text; show the cause instead
  if (/^Failed query:/.test(e.message ?? "")) {
    const cause = (e as { cause?: { message?: string } }).cause?.message
    return `Internal error while syncing (${(cause ?? "database error").slice(0, 200)}). Dispatch will retry automatically.`
  }
  // Nodemailer wraps socket errors as ESOCKET/ECONNECTION; recover the network code from the message
  const netCode = /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EPIPE)\b/.exec(e.message ?? "")?.[1]
  const code = (e.code === "ESOCKET" || e.code === "ECONNECTION" || !e.code ? netCode : e.code) ?? e.code ?? ""
  const label = ctx.kind === "imap" ? "IMAP" : "SMTP"
  const where = ctx.host ? `${ctx.host}${ctx.port ? `:${ctx.port}` : ""}` : "the server"
  const serverText = [e.responseText, typeof e.response === "string" ? e.response : "", e.message]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300)

  if (
    e.authenticationFailed ||
    e.serverResponseCode === "AUTHENTICATIONFAILED" ||
    code === "EAUTH" ||
    e.responseCode === 535 ||
    /authenticat|invalid credentials|login failed|username and password not accepted/i.test(serverText)
  ) {
    if (ctx.oauth) return `${label} login was rejected for the OAuth token. Reconnect the inbox.`
    const hint = /application-specific|app password|web login required|534-5\.7\.9/i.test(serverText)
      ? " This provider requires an app password."
      : " Check the username and password (Gmail, iCloud and Yahoo require an app password)."
    return `${label} authentication failed.${hint}`
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EDNS") return `Host not found: ${ctx.host ?? "unknown host"}. Check the ${label} server name.`
  if (code === "ECONNREFUSED") return `Connection refused by ${where}. Check the ${label} port and security (SSL/TLS) settings.`
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return `${where} is unreachable from this server.`
  if (CERT_CODES.has(code) || /certificate/i.test(e.message ?? "")) {
    return `The TLS certificate of ${where} is not trusted (${code || e.message}). Check the host name or ask your provider for a valid certificate.`
  }
  if (e.tlsFailed || /wrong version number|ssl3_get_record|tls|ssl routines|EPROTO/i.test(`${code} ${e.message}`)) {
    return `Secure connection to ${where} failed. Try the other SSL/TLS setting (port ${ctx.kind === "imap" ? "993 = SSL, 143 = STARTTLS" : "465 = SSL, 587 = STARTTLS"}).`
  }
  if (
    ["ETIMEDOUT", "ETIMEOUT", "CONNECT_TIMEOUT", "GREETING_TIMEOUT", "UPGRADE_TIMEOUT", "ESOCKETTIMEDOUT"].includes(code) ||
    /timed? ?out/i.test(e.message ?? "")
  ) {
    return `Connection to ${where} timed out. Check the host, port and that the server allows connections from this instance.`
  }
  if (code === "ECONNRESET" || code === "NoConnection" || code === "EPIPE") {
    return `${where} closed the connection unexpectedly. Check the port and SSL/TLS settings.`
  }
  if (code === "ETHROTTLE") return `${label} server is throttling requests. Dispatch will retry automatically.`
  return (serverText || `${label} connection failed`).replace(/\s+/g, " ").trim()
}
