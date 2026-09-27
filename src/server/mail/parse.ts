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
  if (clean) return clean
  const ext = contentType.split("/")[1]?.split(/[;+]/)[0]?.replace(/[^a-z0-9]/gi, "").slice(0, 8)
  return `attachment-${index + 1}${ext ? `.${ext}` : ""}`
}

/** Parse a raw RFC 5322 message. */
export async function parseRawEmail(source: Buffer): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(source, {
    keepCidLinks: true,
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
    maxHtmlLengthToParse: 2_000_000,
  })
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
