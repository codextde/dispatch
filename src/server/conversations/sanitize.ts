import "server-only"
import sanitizeHtml from "sanitize-html"
import { convert } from "html-to-text"

/**
 * HTML safety for email bodies, composer output and internal comments.
 *
 * Email HTML is rendered client-side inside a sandboxed iframe without
 * `allow-scripts`, but we still sanitize server-side (defense in depth):
 * scripts, forms, frames, objects, event handlers and javascript: URLs are
 * removed; links open in a new tab; `cid:` images are rewritten to the
 * attachment endpoint; remote images/CSS backgrounds can be blocked (tracking
 * pixels) and reported via `hasRemoteImages`.
 */

const EMAIL_TAGS = [
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "big", "blockquote", "br", "caption", "center",
  "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure",
  "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "ins", "kbd", "li", "main",
  "mark", "nav", "ol", "p", "picture", "pre", "q", "s", "samp", "section", "small", "span", "strike", "strong",
  "style", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul",
  "var", "wbr",
]

const GLOBAL_ATTRS = [
  "style", "class", "id", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing",
  "color", "face", "size", "dir", "lang", "title", "colspan", "rowspan", "nowrap", "role", "type", "start", "span",
]

/**
 * Is this URL fetched from somewhere else than our own origin? Only `data:`,
 * `cid:` and same-origin absolute paths (our attachment URLs) are local;
 * everything else — including `//host`, `\\host`, `http:host` and relative
 * paths — counts as remote.
 */
export function isRemoteUrl(value: string) {
  // What the URL parser sees: tabs and newlines removed, C0 controls and spaces trimmed ("/\t/host" is "//host")
  const v = value.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "")
  if (!v) return false
  if (/^(data|cid):/i.test(v)) return false
  if (/^\/(?![\/\\])/.test(v)) return false
  return true
}

export type SanitizeEmailOptions = {
  /** Replace remote images and CSS backgrounds (default true) */
  blockRemote?: boolean
  /** contentId (without <>) -> URL for inline attachments */
  cidMap?: Map<string, string>
}

/* ------------------------------------ CSS ------------------------------------- */

/*
 * CSS is tokenized (CSS Syntax Level 3) and re-serialized instead of being
 * filtered with regular expressions. Decisions use the decoded token (escapes
 * resolved, exactly as the browser reads it) while the output keeps the
 * original text, so a filter can never be undone by the escapes it removed.
 * Comments are dropped and no `<` survives, so style content can neither end
 * its <style> element nor start a tag.
 */

type CssToken = {
  type: "ws" | "comment" | "string" | "bad-string" | "url" | "bad-url" | "ident" | "function" | "at" | "hash" | "number" | "delim" | "open" | "close" | "cdo" | "cdc"
  start: number
  end: number
  /** Decoded name (ident, function, at-keyword, hash), value (string, url) or the character (delim, open, close) */
  value: string
}

const isDigit = (c: number) => c >= 0x30 && c <= 0x39
const isHex = (c: number) => isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)
const isNameStart = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c >= 0x80
const isNameChar = (c: number) => isNameStart(c) || isDigit(c) || c === 0x2d
const isCssWs = (c: number) => c === 0x0a || c === 0x09 || c === 0x20
const isNonPrintable = (c: number) => (c >= 0 && c <= 0x08) || c === 0x0b || (c >= 0x0e && c <= 0x1f) || c === 0x7f

/** Tokenize preprocessed CSS (newlines normalized to LF, NUL replaced). Never throws. */
function tokenizeCss(s: string): CssToken[] {
  const tokens: CssToken[] = []
  let i = 0
  const at = (k: number) => (k < s.length ? s.charCodeAt(k) : -1)
  const validEscape = (k: number) => at(k) === 0x5c && at(k + 1) !== 0x0a
  const startsIdent = (k: number) => {
    const c = at(k)
    if (c === 0x2d) return isNameStart(at(k + 1)) || at(k + 1) === 0x2d || validEscape(k + 1)
    return isNameStart(c) || validEscape(k)
  }
  const startsNumber = (k: number) => {
    const c = at(k)
    if (c === 0x2b || c === 0x2d) return isDigit(at(k + 1)) || (at(k + 1) === 0x2e && isDigit(at(k + 2)))
    if (c === 0x2e) return isDigit(at(k + 1))
    return isDigit(c)
  }
  // Consumes an escape; `i` points after the backslash
  const escape = (): string => {
    if (i >= s.length) return "\uFFFD"
    if (!isHex(at(i))) return s[i++]!
    let hex = ""
    while (hex.length < 6 && isHex(at(i))) hex += s[i++]
    if (isCssWs(at(i))) i++
    const cp = Number.parseInt(hex, 16)
    return cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? "\uFFFD" : String.fromCodePoint(cp)
  }
  const name = (): string => {
    let out = ""
    for (;;) {
      if (isNameChar(at(i))) out += s[i++]
      else if (validEscape(i)) {
        i++
        out += escape()
      } else return out
    }
  }
  const number = () => {
    if (at(i) === 0x2b || at(i) === 0x2d) i++
    while (isDigit(at(i))) i++
    if (at(i) === 0x2e && isDigit(at(i + 1))) for (i++; isDigit(at(i)); ) i++
    const e = at(i)
    if ((e === 0x45 || e === 0x65) && (isDigit(at(i + 1)) || ((at(i + 1) === 0x2b || at(i + 1) === 0x2d) && isDigit(at(i + 2))))) {
      for (i += 2; isDigit(at(i)); ) i++
    }
    if (startsIdent(i)) name()
    else if (at(i) === 0x25) i++
  }
  const string = (quote: number): [CssToken["type"], string] => {
    let out = ""
    for (i++; ; ) {
      const c = at(i)
      if (c === -1) return ["string", out]
      if (c === quote) {
        i++
        return ["string", out]
      }
      if (c === 0x0a) return ["bad-string", out]
      if (c === 0x5c) {
        if (at(i + 1) === -1) i++
        else if (at(i + 1) === 0x0a) i += 2
        else {
          i++
          out += escape()
        }
        continue
      }
      out += s[i++]
    }
  }
  const badUrlRemnants = () => {
    for (;;) {
      const c = at(i)
      if (c === -1) return
      i++
      if (c === 0x29) return
      if (c === 0x5c && at(i) !== 0x0a) escape()
    }
  }
  const url = (): [CssToken["type"], string] => {
    let out = ""
    while (isCssWs(at(i))) i++
    for (;;) {
      const c = at(i)
      if (c === -1) return ["url", out]
      if (c === 0x29) {
        i++
        return ["url", out]
      }
      if (isCssWs(c)) {
        while (isCssWs(at(i))) i++
        if (at(i) === 0x29 || at(i) === -1) {
          if (at(i) === 0x29) i++
          return ["url", out]
        }
        badUrlRemnants()
        return ["bad-url", out]
      }
      if (c === 0x22 || c === 0x27 || c === 0x28 || isNonPrintable(c)) {
        badUrlRemnants()
        return ["bad-url", out]
      }
      if (c === 0x5c) {
        if (!validEscape(i)) {
          badUrlRemnants()
          return ["bad-url", out]
        }
        i++
        out += escape()
        continue
      }
      out += s[i++]
    }
  }
  const identLike = (): [CssToken["type"], string] => {
    const n = name()
    if (at(i) !== 0x28) return ["ident", n]
    i++
    if (n.toLowerCase() !== "url") return ["function", n]
    let k = i
    while (isCssWs(at(k))) k++
    // url("…") is a function holding a string; url(…) an unquoted url token
    return at(k) === 0x22 || at(k) === 0x27 ? ["function", n] : url()
  }

  while (i < s.length) {
    const start = i
    const c = at(i)
    let type: CssToken["type"]
    let value = ""
    if (c === 0x2f && at(i + 1) === 0x2a) {
      const end = s.indexOf("*/", i + 2)
      i = end === -1 ? s.length : end + 2
      type = "comment"
    } else if (isCssWs(c)) {
      while (isCssWs(at(i))) i++
      type = "ws"
    } else if (c === 0x22 || c === 0x27) {
      ;[type, value] = string(c)
    } else if (c === 0x23 && (isNameChar(at(i + 1)) || validEscape(i + 1))) {
      i++
      value = name()
      type = "hash"
    } else if (c === 0x28 || c === 0x5b || c === 0x7b) {
      value = s[i++]!
      type = "open"
    } else if (c === 0x29 || c === 0x5d || c === 0x7d) {
      value = s[i++]!
      type = "close"
    } else if (startsNumber(i)) {
      number()
      type = "number"
    } else if (c === 0x2d && at(i + 1) === 0x2d && at(i + 2) === 0x3e) {
      i += 3
      type = "cdc"
    } else if (c === 0x3c && s.startsWith("!--", i + 1)) {
      i += 4
      type = "cdo"
    } else if (c === 0x40 && startsIdent(i + 1)) {
      i++
      value = name()
      type = "at"
    } else if (startsIdent(i)) {
      ;[type, value] = identLike()
    } else {
      value = s[i++]!
      type = "delim"
    }
    tokens.push({ type, start, end: i, value })
  }
  return tokens
}

const CLOSER: Record<string, string> = { "(": ")", "[": "]", "{": "}" }
/** Real-world CSS nests a few levels; deeper CSS is dropped (fail closed, and keeps the work linear) */
const MAX_CSS_DEPTH = 32
/** Longer CSS (one <style> block or style attribute) is dropped */
const MAX_CSS_LENGTH = 256 * 1024

/**
 * For every function or block opener, the index after its matching closer (or
 * the end), computed in one pass. Null when blocks nest deeper than MAX_CSS_DEPTH.
 */
function matchCssBlocks(tokens: CssToken[]): Int32Array | null {
  const ends = new Int32Array(tokens.length).fill(tokens.length)
  const open: number[] = []
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j]!
    if (t.type === "function" || t.type === "open") {
      if (open.push(j) > MAX_CSS_DEPTH) return null
    } else if (t.type === "close" && open.length) {
      const top = tokens[open[open.length - 1]!]!
      // A closer of another kind is an ordinary token inside the block (CSS Syntax 3)
      if (t.value === (top.type === "function" ? ")" : CLOSER[top.value])) ends[open.pop()!] = j + 1
    }
  }
  return ends
}

/** Index after the at-rule starting at tokens[k]: its `;`, its {} block, or up to the closer of the enclosing block. */
function cssStatementEnd(tokens: CssToken[], ends: Int32Array, k: number): number {
  for (let j = k + 1; j < tokens.length; j++) {
    const t = tokens[j]!
    if (t.type === "delim" && t.value === ";") return j + 1
    if (t.type === "open" && t.value === "{") return ends[j]!
    if (t.type === "function" || t.type === "open") j = ends[j]! - 1
    else if (t.type === "close" && t.value === "}") return j
  }
  return tokens.length
}

/** Functions whose arguments are fetched as images (strings included). */
const CSS_FETCH_FUNCTIONS = new Set(["url", "src", "image", "image-set", "-webkit-image-set", "-moz-image-set", "-o-image-set"])
const CSS_DANGEROUS_IDENTS = new Set(["behavior", "-moz-binding"])

function cssUrlVerdict(value: string): "local" | "remote" | "dangerous" {
  if (/^(?:javascript|vbscript):/i.test(value.replace(/[\u0000-\u0020]/g, ""))) return "dangerous"
  return isRemoteUrl(value) ? "remote" : "local"
}

/**
 * Verdict for the arguments of a fetching function. Anything that is not a
 * plain local URL fails closed: bad tokens, and functions such as var() or
 * attr() that could supply a URL later.
 */
function cssFetchVerdict(tokens: CssToken[], start: number, end: number): "local" | "remote" | "dangerous" {
  let verdict: "local" | "remote" = "local"
  for (let j = start; j < end; j++) {
    const t = tokens[j]!
    if (t.type === "url" || t.type === "string") {
      const v = cssUrlVerdict(t.value)
      if (v === "dangerous") return v
      if (v === "remote") verdict = "remote"
    } else if (t.type === "bad-url" || t.type === "bad-string") {
      verdict = "remote"
    } else if (t.type === "function") {
      const name = t.value.toLowerCase()
      if (!CSS_FETCH_FUNCTIONS.has(name) && !name.endsWith("-gradient") && name !== "type") verdict = "remote"
    }
  }
  return verdict
}

/**
 * Clean CSS from an email (a <style> block or a style attribute): drops
 * comments, @import, expression() and legacy binding properties, and reports
 * (and with `blockRemote` replaces) everything that would be fetched from
 * another origin.
 */
function cleanCss(css: string, blockRemote: boolean, onRemote: () => void): string {
  if (css.length > MAX_CSS_LENGTH) return ""
  const s = css.replace(/\r\n?|\f/g, "\n").replace(/\u0000/g, "\uFFFD")
  const tokens = tokenizeCss(s)
  const ends = matchCssBlocks(tokens)
  if (!ends) return ""
  const raw = (t: CssToken) => s.slice(t.start, t.end).replace(/</g, "\\3c ")
  let out = ""
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i]!
    const name = t.value.toLowerCase()
    if (t.type === "comment" || t.type === "cdo" || t.type === "cdc" || (t.type === "delim" && t.value === "<")) {
      out += " "
      i++
    } else if (t.type === "at" && name === "import") {
      out += " "
      i = cssStatementEnd(tokens, ends, i)
    } else if ((t.type === "function" && name === "expression") || (t.type === "ident" && CSS_DANGEROUS_IDENTS.has(name))) {
      out += " "
      i = t.type === "function" ? ends[i]! : i + 1
    } else if (t.type === "url" || t.type === "bad-url" || (t.type === "function" && CSS_FETCH_FUNCTIONS.has(name))) {
      const end = t.type === "function" ? ends[i]! : i + 1
      const verdict = t.type === "url" ? cssUrlVerdict(t.value) : t.type === "bad-url" ? "dangerous" : cssFetchVerdict(tokens, i + 1, end)
      if (verdict === "remote") onRemote()
      if (verdict === "dangerous" || (verdict === "remote" && blockRemote)) {
        out += " none "
        i = end
      } else {
        // Allowed: arguments are still serialized (and checked) token by token
        out += raw(t)
        i++
      }
    } else {
      out += raw(t)
      i++
    }
  }
  return out
}

export function sanitizeEmailHtml(html: string, opts: SanitizeEmailOptions = {}) {
  const blockRemote = opts.blockRemote ?? true
  let hasRemoteImages = false
  const markRemote = () => {
    hasRemoteImages = true
  }

  const result = sanitizeHtml(html, {
    allowedTags: EMAIL_TAGS,
    allowVulnerableTags: true, // <style> is allowed; its content is cleaned below
    nonTextTags: ["script", "textarea", "option", "noscript", "title", "xml", "object", "applet", "svg", "math", "template"],
    allowedAttributes: {
      "*": GLOBAL_ATTRS,
      a: ["href", "name", "target", "rel"],
      div: ["data-signature-id"],
      img: ["src", "alt", "data-blocked-src"],
      td: ["background", "headers", "scope", "abbr"],
      th: ["background", "headers", "scope", "abbr"],
      table: ["background", "summary"],
      ol: ["reversed"],
      time: ["datetime"],
      blockquote: ["cite"],
      q: ["cite"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite", "background"],
    allowProtocolRelative: true,
    parseStyleAttributes: false,
    transformTags: {
      "*": (tagName, attribs) => {
        const next = { ...attribs }
        if (next.style) next.style = cleanCss(next.style, blockRemote, markRemote)
        if (next.background) {
          if (isRemoteUrl(next.background)) {
            markRemote()
            if (blockRemote) delete next.background
          } else delete next.background
        }
        return { tagName, attribs: next }
      },
      a: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs, rel: "noopener noreferrer nofollow" }
        if (next.href && !next.href.startsWith("#")) next.target = "_blank"
        return { tagName, attribs: next }
      },
      img: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs }
        delete next["data-blocked-src"]
        const src = (next.src ?? "").trim()
        if (/^cid:/i.test(src)) {
          const cid = src.slice(4).replace(/^<|>$/g, "")
          const url = opts.cidMap?.get(cid)
          if (url) next.src = url
          else delete next.src
        } else if (isRemoteUrl(src)) {
          markRemote()
          if (blockRemote) {
            next["data-blocked-src"] = src
            delete next.src
          }
        }
        return { tagName, attribs: next }
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src && !frame.attribs["data-blocked-src"],
  })

  // Clean the contents of <style> blocks (sanitize-html keeps them verbatim). Attribute values and
  // text are entity-escaped, so this only matches real <style> elements; the cleaned CSS holds no "<".
  const cleaned = result.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => {
    return `<style${attrs}>${cleanCss(css, blockRemote, markRemote)}</style>`
  })

  return { html: cleaned, hasRemoteImages }
}

/** Plain-text email body → safe HTML (links, quoted lines as blockquotes). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const linkify = (s: string) =>
    s.replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`)
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const out: string[] = []
  let quote: string[] = []
  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote type="cite">${textToHtml(quote.join("\n"))}</blockquote>`)
    quote = []
  }
  for (const line of lines) {
    if (/^\s*>/.test(line)) {
      quote.push(line.replace(/^\s*> ?/, ""))
      continue
    }
    flushQuote()
    out.push(linkify(esc(line)))
  }
  flushQuote()
  return `<div style="white-space:pre-wrap">${out.join("\n").replace(/<\/blockquote>\n/g, "</blockquote>")}</div>`
}

/** HTML written in the composer (Tiptap + signatures + canned responses). */
export function sanitizeComposerHtml(html: string): string {
  return sanitizeEmailHtml(html, { blockRemote: false }).html
}

const COMMENT_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "a", "ul", "ol", "li", "blockquote", "span"]

/**
 * Internal comments (Tiptap output). Keeps mention spans
 * (`<span data-type="mention" data-id="uuid">`) and returns mentioned ids.
 */
export function sanitizeCommentHtml(html: string): { html: string; mentionIds: string[]; text: string } {
  const mentionIds = new Set<string>()
  const clean = sanitizeHtml(html, {
    allowedTags: COMMENT_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-type", "data-id", "data-label", "class"],
    },
    allowedClasses: { span: ["mention"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } }),
      span: (tagName, attribs) => {
        if (attribs["data-type"] === "mention" && attribs["data-id"]) {
          mentionIds.add(attribs["data-id"])
          return {
            tagName,
            attribs: { "data-type": "mention", "data-id": attribs["data-id"], ...(attribs["data-label"] ? { "data-label": attribs["data-label"] } : {}), class: "mention" },
          }
        }
        return { tagName, attribs: {} }
      },
    },
  })
  return { html: clean, mentionIds: [...mentionIds], text: htmlToPlainText(clean) }
}

export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true, ignoreHref: false } },
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
    ],
  }).trim()
}

export function makeSnippet(text: string, max = 200): string {
  return text
    .replace(/^>.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}
