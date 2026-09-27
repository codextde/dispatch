import DOMPurify from "isomorphic-dompurify"

/** Client-side HTML sanitizing for user-authored snippets (signatures, response previews). */
export function purify(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
  })
}
