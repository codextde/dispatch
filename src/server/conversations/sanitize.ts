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

const REMOTE_URL_RE = /^(https?:)?\/\//i
const CSS_URL_RE = /url\(\s*(['"]?)\s*((?:https?:)?\/\/[^)'"]*)\1\s*\)/gi
const DANGEROUS_CSS_RE = /expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:/gi

export type SanitizeEmailOptions = {
  /** Replace remote images and CSS backgrounds (default true) */
  blockRemote?: boolean
  /** contentId (without <>) -> URL for inline attachments */
  cidMap?: Map<string, string>
}

function cleanCss(css: string, blockRemote: boolean, onRemote: () => void) {
  let out = css.replace(DANGEROUS_CSS_RE, "")
  out = out.replace(/@import[^;]*;?/gi, "")
  out = out.replace(CSS_URL_RE, (match) => {
    onRemote()
    return blockRemote ? "none" : match
  })
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
          if (REMOTE_URL_RE.test(next.background)) {
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
        } else if (REMOTE_URL_RE.test(src)) {
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

  // Clean the contents of <style> blocks (sanitize-html keeps them verbatim).
  const cleaned = result.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => {
    return `<style${attrs}>${cleanCss(css, blockRemote, markRemote).replace(/<\/?[a-z][^>]*>/gi, "")}</style>`
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
