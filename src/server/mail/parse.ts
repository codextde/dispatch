import crypto from "node:crypto"
import { simpleParser, type AddressObject, type HeaderValue, type ParsedMail } from "mailparser"
import { convert } from "html-to-text"
import type { Participant } from "@/server/db/schema"

/**
 * Pure helpers to parse raw RFC 5322 messages into the shape stored by
 * Dispatch, plus threading / loop-protection utilities. No database access,
 * so everything here is unit tested (src/server/mail/__tests__).
 */

export const SNIPPET_LENGTH = 200
const MAX_REFERENCES = 50
const MAX_STORED_HEADERS = 60
const MAX_HEADER_VALUE = 1000
const MAX_ID_LENGTH = 900
/** Plain-text bodies are capped (Postgres full-text index limits; the HTML part is kept whole) */
const MAX_TEXT_BODY = 300_000

/** Postgres rejects NUL in text/jsonb; mailparser keeps them (e.g. QP "=00"). */
export function stripNul<T extends string | null | undefined>(value: T): T {
  return (typeof value === "string" ? value.replace(/\u0000/g, "") : value) as T
}

/* --------------------------------- Message-IDs -------------------------------- */

/** Normalize a Message-ID: strip angle brackets and whitespace. */
export function cleanMessageId(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /<([^<>]+)>/.exec(value)
  const id = (m ? m[1]! : value).replace(/[\s\u0000]+/g, "").replace(/^<|>$/g, "")
  return id ? id.slice(0, MAX_ID_LENGTH) : null
}

/** Parse a References / In-Reply-To header into a list of Message-IDs (oldest first). */
export function parseReferences(value: string | string[] | null | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value.join(" ") : value
  const bracketed = [...raw.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]!.replace(/\u0000/g, "").slice(0, MAX_ID_LENGTH))
  const ids = bracketed.length ? bracketed : raw.split(/[\s,]+/).map((s) => cleanMessageId(s)).filter((s): s is string => Boolean(s))
  const out: string[] = []
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out.slice(-MAX_REFERENCES)
}

/** Stable id for messages without a Message-ID header (dedupe across re-syncs). */
export function synthesizeMessageId(parts: {
  date?: Date | null
  from?: string | null
  to?: string[]
  subject?: string | null
  body?: string | null
}): string {
  const h = crypto
    .createHash("sha256")
    .update(
      [
        parts.date ? parts.date.toISOString() : "",
        (parts.from ?? "").toLowerCase(),
        (parts.to ?? []).map((t) => t.toLowerCase()).sort().join(","),
        parts.subject ?? "",
        (parts.body ?? "").slice(0, 2000),
      ].join("\n")
    )
    .digest("hex")
    .slice(0, 32)
  return `synthetic-${h}@dispatch.invalid`
}

/** Generate a fresh Message-ID for an outbound message on the account's domain. */
export function generateMessageId(fromEmail: string): string {
  const domain = (fromEmail.split("@")[1] || "dispatch.local").toLowerCase().replace(/[^a-z0-9.-]/g, "")
  return `${crypto.randomUUID()}@${domain || "dispatch.local"}`
}

/* ----------------------------------- Subjects --------------------------------- */

// Re / Fwd prefixes in common languages: RE, FW, FWD, AW (de), WG (de), SV (nordic),
// VS (fi), ANTW (nl), RIF/R (it), TR (fr), ODP/PD (pl), ENC/RES (pt), RV (es), YNT (tr), 回复/转发 (zh)
const PREFIX_RE =
  /^\s*(?:\[[^\]]{1,40}\]\s*)?(?:re|fw|fwd|aw|wg|sv|vs|antw|antwort|rif|r|tr|odp|pd|enc|res|ref|rv|ynt|ilt|atb|vl|continued|回复|回覆|答复|转发|轉寄)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*/i

/** Remove leading reply/forward prefixes (keeps case), e.g. "Re: AW: Hello" -> "Hello". */
export function stripReplyPrefixes(subject: string): string {
  let s = subject ?? ""
  for (let i = 0; i < 10; i++) {
    const next = s.replace(PREFIX_RE, "")
    if (next === s) break
    s = next
  }
  return s.trim()
}

export function hasReplyPrefix(subject: string | null | undefined): boolean {
  return Boolean(subject) && PREFIX_RE.test(subject!)
}

/** Subject key used for fallback threading: prefixes stripped, whitespace collapsed, lowercase. */
export function normalizeSubject(subject: string | null | undefined): string {
  return stripReplyPrefixes(subject ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/* ---------------------------------- Addresses --------------------------------- */

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

/** Flatten a mailparser address object (incl. groups) into participants. */
export function addressList(value: AddressObject | AddressObject[] | undefined | null): Participant[] {
  if (!value) return []
  const out: Participant[] = []
  const visit = (entries: AddressObject["value"]) => {
    for (const e of entries) {
      if (e.group?.length) visit(e.group)
      const email = stripNul(normalizeEmail(e.address)).slice(0, 320)
      if (email && email.includes("@")) out.push({ name: stripNul(e.name)?.trim().slice(0, 200) || null, email })
    }
  }
  for (const obj of Array.isArray(value) ? value : [value]) visit(obj.value ?? [])
  return out
}

/** Dedupe by email (first non-empty name wins) and drop excluded addresses. */
export function mergeParticipants(lists: Participant[][], exclude: Set<string> = new Set()): Participant[] {
  const map = new Map<string, Participant>()
  for (const list of lists) {
    for (const p of list) {
      const email = normalizeEmail(p.email)
      if (!email || exclude.has(email)) continue
      const existing = map.get(email)
      if (!existing) map.set(email, { name: p.name?.trim() || null, email })
      else if (!existing.name && p.name) existing.name = p.name.trim()
    }
  }
  return [...map.values()]
}

export function emailDomain(email: string | null | undefined): string {
  return normalizeEmail(email).split("@")[1] ?? ""
}

/* ------------------------------------ Text ------------------------------------ */

export function htmlToPlainText(html: string): string {
  try {
    return convert(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "head", format: "skip" },
      ],
    })
  } catch {
    return html.replace(/<[^>]+>/g, " ")
  }
}

/** Plain text including link targets (for the text/plain part of outbound mail). */
export function htmlToMailText(html: string): string {
  try {
    return convert(html, {
      wordwrap: 78,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ],
    })
  } catch {
    return html.replace(/<[^>]+>/g, " ")
  }
}

const QUOTE_START = [
  /^>/m,
  /^On .{5,200}wrote:\s*$/m,
  /^Am .{5,200}schrieb.{0,60}:\s*$/m,
  /^Le .{5,200}a écrit\s*:\s*$/m,
  /^El .{5,200}escribió:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Ursprüngliche Nachricht\s*-{2,}/im,
  /^_{10,}\s*$/m,
  /^From: .+\n(?:Sent|Date): /m,
  /^Von: .+\n(?:Gesendet|Datum): /m,
]

/** Short preview: first ~200 chars of the new part of the message (quoted history removed). */
export function makeSnippet(text: string | null | undefined, html?: string | null): string {
  let body = text?.trim() ? text : html ? htmlToPlainText(html) : ""
  let cut = body.length
  for (const re of QUOTE_START) {
    const m = re.exec(body)
    if (m && m.index > 0 && m.index < cut) cut = m.index
  }
  body = body.slice(0, cut)
  return body.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LENGTH)
}

/* ----------------------------------- Headers ---------------------------------- */

const SKIP_HEADERS = new Set([
  "from", "to", "cc", "bcc", "subject", "date", "message-id", "in-reply-to", "references", "reply-to",
  "received", "dkim-signature", "domainkey-signature", "authentication-results", "received-spf",
  "arc-seal", "arc-message-signature", "arc-authentication-results", "mime-version", "content-type",
  "content-transfer-encoding", "content-disposition", "content-id", "x-received", "x-gm-message-state",
  "x-google-smtp-source", "x-google-dkim-signature", "thread-index", "thread-topic",
])
// x-dispatch-* are set by Dispatch on outbound mail; never trust them on inbound mail
const SKIP_PREFIXES = ["x-ms-exchange-", "x-microsoft-", "x-forefront-", "x-google-", "x-gm-", "x-ms-", "x-mailgun-sending", "x-dispatch-"]

function headerValueToString(v: HeaderValue | undefined): string {
  if (v === undefined || v === null) return ""
  if (typeof v === "string") return v
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return (v as unknown[]).map((x) => headerValueToString(x as HeaderValue)).join(", ")
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text
    if ("value" in v) {
      const params = "params" in v && v.params ? Object.entries(v.params).map(([k, p]) => `; ${k}=${p}`).join("") : ""
      return `${String(v.value)}${params}`
    }
  }
  return String(v)
}

/** Unfolded raw value of a header line ("Key: value"). */
function rawHeaderValue(line: string): string {
  const i = line.indexOf(":")
  return (i >= 0 ? line.slice(i + 1) : line).replace(/\r?\n[ \t]+/g, " ").trim()
}

/**
 * Subset of headers worth keeping (list/auto-reply signals, custom x-* headers).
 * Keys are lowercase. mailparser folds List-* headers into a structured "list"
 * entry, so those are taken from the raw header lines instead.
 */
export function extractHeaders(
  headers: Map<string, HeaderValue>,
  headerLines: ReadonlyArray<{ key: string; line: string }> = []
): Record<string, string> {
  const out: Record<string, string> = {}
  let count = 0
  const add = (key: string, value: string) => {
    if (count >= MAX_STORED_HEADERS || key in out) return
    if (SKIP_HEADERS.has(key) || SKIP_PREFIXES.some((p) => key.startsWith(p))) return
    const str = stripNul(value).replace(/\s+/g, " ").trim().slice(0, MAX_HEADER_VALUE)
    if (!str) return
    out[key] = str
    count++
  }
  for (const { key, line } of headerLines) {
    const k = key.toLowerCase()
    if (k.startsWith("list-")) add(k, rawHeaderValue(line))
  }
  for (const [rawKey, value] of headers) {
    const key = rawKey.toLowerCase()
    if (key === "list") continue
    add(key, headerValueToString(value))
  }
  return out
}

/* ------------------------------- Loop protection ------------------------------ */

const NO_REPLY_LOCAL = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|noreply[-_.].*|.*[-_.]noreply)(?:\+.*)?$/i

/**
 * True for messages that must never get an automatic reply (RFC 3834):
 * auto-submitted, bulk/list mail, bounces, no-reply senders.
 */
export function isAutomatedMessage(msg: { headers: Record<string, string>; fromEmail: string | null | undefined }): boolean {
  const h = msg.headers
  const autoSubmitted = h["auto-submitted"]?.toLowerCase().trim()
  if (autoSubmitted && autoSubmitted !== "no") return true
  const precedence = h["precedence"]?.toLowerCase().trim()
  if (precedence && ["bulk", "list", "junk", "auto_reply", "auto-reply"].includes(precedence)) return true
  if (h["list-id"] || h["list-unsubscribe"] || h["list-post"]) return true
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-reply"]) return true
  if (/\b(all|oof|autoreply)\b/i.test(h["x-auto-response-suppress"] ?? "")) return true
  if ((h["x-dispatch-rule"] ?? "") !== "") return true
  const from = normalizeEmail(msg.fromEmail)
  if (!from || !from.includes("@")) return true
  const local = from.split("@")[0]!
  return NO_REPLY_LOCAL.test(local)
}

/**
 * Bounces and automatic replies. Forwarding them can loop (forward → bounce →
 * forward …); other automated mail such as notifications may be forwarded.
 */
export function isBounceOrAutoReply(msg: { headers: Record<string, string>; fromEmail: string | null | undefined }): boolean {
  const h = msg.headers
  if ((h["auto-submitted"] ?? "").toLowerCase().trim().startsWith("auto-replied")) return true
  if (["auto_reply", "auto-reply"].includes((h["precedence"] ?? "").toLowerCase().trim())) return true
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-reply"] || h["x-failed-recipients"]) return true
  return /^(?:mailer[-_.]?daemon|postmaster)(?:\+[^@]*)?@/i.test(normalizeEmail(msg.fromEmail))
}

/* ---------------------------------- Parsing ----------------------------------- */

export type ParsedAttachment = {
  filename: string
  contentType: string
  size: number
  content: Buffer
  contentId: string | null
  isInline: boolean
}

export type ParsedEmail = {
  messageId: string
  hasOriginalMessageId: boolean
  inReplyTo: string | null
  references: string[]
  subject: string
  from: Participant | null
  sender: Participant | null
  to: Participant[]
  cc: Participant[]
  bcc: Participant[]
  replyTo: Participant[]
  date: Date | null
  html: string | null
  text: string | null
  snippet: string
  headers: Record<string, string>
  attachments: ParsedAttachment[]
  size: number
}

function safeFilename(name: string | undefined, contentType: string, index: number): string {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f/\\]+/g, "_").trim().slice(-200)
  // "." and ".." are not file names (they would address a directory in storage)
  if (clean && !/^\.+$/.test(clean)) return clean
  const ext = contentType.split("/")[1]?.split(/[;+]/)[0]?.replace(/[^a-z0-9]/gi, "").slice(0, 8)
  return `attachment-${index + 1}${ext ? `.${ext}` : ""}`
}

/**
 * Messages with more MIME parts are stored as a short note instead of being
 * parsed: mailparser never settles once a message reaches its 1000-node limit
 * while an attachment is pending.
 */
export const MAX_MIME_PARTS = 500
/** Hard limit for parsing one message (a hostile message must not stall a mailbox). */
export const PARSE_TIMEOUT_MS = 30_000

export class MailParseTimeoutError extends Error {
  code = "EPARSETIMEOUT"
  constructor(ms: number) {
    super(`Parsing the message took longer than ${Math.round(ms / 1000)}s`)
  }
}

/** Calls `fn` with the offset of every line that starts with "--" (a lone CR also ends a line for the MIME splitter). */
function forEachDashLine(text: string, fn: (start: number) => void) {
  for (let i = text.indexOf("--"); i !== -1; i = text.indexOf("--", i + 2)) {
    const prev = i === 0 ? 0x0a : text.charCodeAt(i - 1)
    if (prev === 0x0a || prev === 0x0d) fn(i)
  }
}

/** Text after the leading "--" up to the end of the line (at most 1 KB). */
function dashLineRest(text: string, start: number): string {
  const from = start + 2
  const max = Math.min(text.length, from + 1024)
  let end = from
  while (end < max && text.charCodeAt(end) !== 0x0a && text.charCodeAt(end) !== 0x0d) end++
  return text.slice(from, end)
}

/**
 * Upper bound of the MIME nodes the parser would create: delimiter lines of
 * declared boundaries plus embedded messages. Lines that merely start with
 * "--" (signatures, diffs) are only discounted when every boundary could be
 * read; RFC 2231 encoded boundaries fail closed.
 */
export function countMimeParts(source: Buffer): number {
  const text = source.toString("latin1")
  const embedded = text.match(/message\/rfc822/gi)?.length ?? 0
  let dashLines = 0
  forEachDashLine(text, () => dashLines++)
  if (dashLines + embedded <= MAX_MIME_PARTS || /\bboundary\s*\*/i.test(text)) return dashLines + embedded

  const boundaries = new Set<string>()
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ")
  for (const m of unfolded.matchAll(/\bboundary\s*=\s*(?:"((?:[^"\\\r\n]|\\.)*)"|([^\r\n;]*))/gi)) {
    const value = m[1] ?? m[2] ?? ""
    for (const b of [value, value.replace(/\\(.)/g, "$1"), value.trim(), value.split(/\s/)[0]!]) if (b) boundaries.add(b)
  }
  // Non-ASCII boundaries may be re-encoded by the parser (invalid UTF-8): count every "--" line
  if ([...boundaries].some((b) => /[^\x00-\x7f]/.test(b))) return dashLines + embedded
  let delimiters = 0
  forEachDashLine(text, (start) => {
    const rest = dashLineRest(text, start)
    if (boundaries.has(rest) || (rest.endsWith("--") && boundaries.has(rest.slice(0, -2)))) delimiters++
  })
  return delimiters + embedded
}

/**
 * A stand-in message that keeps the original headers (sender, subject,
 * threading) and replaces the body with `note`.
 */
export function placeholderSource(headers: string, note: string): Buffer {
  const head = headers
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)
    .filter((l) => l && !/^content-(type|transfer-encoding|disposition)\s*:/i.test(l))
    .join("\r\n")
  return Buffer.from(`${head}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${note}\r\n`, "utf8")
}

/** The top-level header block of a raw message (the parser refuses more than 1 MB anyway). */
function headerBlock(source: Buffer): string {
  const ends = [source.indexOf("\r\n\r\n"), source.indexOf("\n\n")].filter((i) => i >= 0)
  return source.subarray(0, Math.min(ends.length ? Math.min(...ends) : source.length, 1024 * 1024)).toString("utf8")
}

/** Rejects with `onTimeout()` when `promise` has not settled after `ms` (the work itself is not cancelled). */
export async function withDeadline<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms)
  })
  try {
    return await Promise.race([promise, deadline])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse a raw RFC 5322 message. Rejects with `MailParseTimeoutError` when
 * parsing takes longer than `timeoutMs`.
 */
export async function parseRawEmail(source: Buffer, opts: { timeoutMs?: number } = {}): Promise<ParsedEmail> {
  const parts = countMimeParts(source)
  const input =
    parts > MAX_MIME_PARTS
      ? placeholderSource(
          headerBlock(source),
          `This message has too many parts to import (${parts}). Open it in your email client to read it.`
        )
      : source
  const timeoutMs = opts.timeoutMs ?? PARSE_TIMEOUT_MS
  const parsed: ParsedMail = await withDeadline(
    simpleParser(input, {
      keepCidLinks: true,
      skipImageLinks: true,
      skipTextToHtml: true,
      skipTextLinks: true,
      maxHtmlLengthToParse: 2_000_000,
    }),
    timeoutMs,
    () => new MailParseTimeoutError(timeoutMs)
  )
  const from = addressList(parsed.from)[0] ?? null
  const sender = addressList(parsed.headers.get("sender") as AddressObject | undefined)[0] ?? null
  const to = addressList(parsed.to)
  const cc = addressList(parsed.cc)
  const bcc = addressList(parsed.bcc)
  const replyTo = addressList(parsed.replyTo)
  const subject = stripNul(parsed.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 998)
  const html = typeof parsed.html === "string" && parsed.html.trim() ? stripNul(parsed.html) : null
  const text = parsed.text?.trim() ? stripNul(parsed.text).slice(0, MAX_TEXT_BODY) : null
  const date = parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : null

  const originalId = cleanMessageId(parsed.messageId)
  const messageId =
    originalId ??
    synthesizeMessageId({ date, from: from?.email, to: [...to, ...cc].map((p) => p.email), subject, body: text ?? html })

  const references = parseReferences(parsed.references)
  const inReplyTo = parseReferences(parsed.inReplyTo)[0] ?? null
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo)

  const attachments: ParsedAttachment[] = parsed.attachments
    .filter((a) => Buffer.isBuffer(a.content))
    .map((a, i) => {
      const contentType = stripNul(a.contentType || "application/octet-stream").toLowerCase().slice(0, 200)
      const contentId = cleanMessageId(a.contentId ?? a.cid ?? null)
      const isInline = Boolean(contentId) && (a.contentDisposition === "inline" || a.related === true || contentType.startsWith("image/"))
      return {
        filename: safeFilename(a.filename, contentType, i),
        contentType,
        size: a.size ?? a.content.length,
        content: a.content,
        contentId,
        isInline,
      }
    })

  return {
    messageId,
    hasOriginalMessageId: Boolean(originalId),
    inReplyTo,
    references: references.filter((r) => r !== messageId),
    subject,
    from,
    sender,
    to,
    cc,
    bcc,
    replyTo,
    date,
    html,
    text,
    snippet: makeSnippet(text, html),
    headers: extractHeaders(parsed.headers, parsed.headerLines),
    attachments,
    size: source.length,
  }
}
