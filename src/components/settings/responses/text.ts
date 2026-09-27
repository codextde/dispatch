const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " }

/** Plain-text snippet of stored rich text (safe for SSR, display only). */
export function htmlSnippet(html: string, max = 160): string {
  const text = html
    .replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function isBlankHtml(html: string): boolean {
  return !/<img\b/i.test(html) && htmlSnippet(html, 10).length === 0
}

export const SHORTCUT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

export function normalizeShortcutInput(v: string) {
  return v.trim().replace(/^\/+/, "").toLowerCase()
}
