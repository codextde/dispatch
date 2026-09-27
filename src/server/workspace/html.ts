import "server-only"
import sanitizeHtml from "sanitize-html"

/**
 * Sanitize rich text authored in settings (canned responses, signatures,
 * auto-replies). Keeps simple formatting, links and images; strips scripts,
 * styles, event handlers and unsafe URL schemes. `{{variables}}` survive as
 * plain text.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote",
      "code", "pre", "h1", "h2", "h3", "hr", "span", "div", "img", "table", "tbody", "tr", "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "title"],
      td: ["colspan", "rowspan"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-size": [/^\d{1,2}(px|em|rem|%)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http", "data", "cid"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  }).trim()
}

/** Plain-text version (for previews and search). */
export function htmlToPlain(html: string): string {
  return sanitizeHtml(html.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "$&\n").replace(/<br\s*\/?>/gi, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** True when the HTML has no visible text or images (e.g. "<p></p>"). */
export function isEmptyRichText(html: string): boolean {
  return !/<img\b/i.test(html) && htmlToPlain(html).trim().length === 0
}
