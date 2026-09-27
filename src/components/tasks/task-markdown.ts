import { marked } from "marked"
import DOMPurify from "isomorphic-dompurify"

/**
 * Task descriptions are written by any member and rendered inside the app
 * itself (not a sandboxed frame), so only plain Markdown output survives: no
 * styles, forms or images (remote images would be tracking pixels). Links
 * open in a new tab without a referrer or `window.opener`.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "b", "em", "i", "del", "s", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
]
const ALLOWED_ATTR = ["href", "title", "start", "align"]

export function renderTaskMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, breaks: true }) as string
  const body = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, RETURN_DOM: true }) as HTMLElement
  for (const a of body.querySelectorAll("a")) {
    a.setAttribute("target", "_blank")
    a.setAttribute("rel", "noopener noreferrer")
  }
  return body.innerHTML
}
