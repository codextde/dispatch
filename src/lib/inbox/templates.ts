/**
 * Variable rendering for canned responses and signatures.
 *
 *   {{contact.name}} {{contact.first_name}} {{contact.last_name}} {{contact.email}}
 *   {{user.name}} {{user.first_name}} {{user.last_name}} {{user.email}} {{user.title}}
 *   {{org.name}}
 *
 * Values are HTML-escaped. Unknown variables render as an empty string.
 */
export type TemplateContext = {
  contact?: { name?: string | null; email?: string | null } | null
  user?: { name?: string | null; email?: string | null; title?: string | null } | null
  org?: { name?: string | null } | null
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function nameParts(name: string | null | undefined, email: string | null | undefined) {
  const full = (name || "").trim() || (email ? email.split("@")[0]!.replace(/[._-]+/g, " ") : "")
  const parts = full.split(/\s+/).filter(Boolean)
  const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)
  return {
    full: name?.trim() || parts.map(cap).join(" "),
    first: cap(parts[0] ?? ""),
    last: parts.length > 1 ? cap(parts[parts.length - 1]!) : "",
  }
}

export function templateValues(ctx: TemplateContext): Record<string, string> {
  const c = nameParts(ctx.contact?.name, ctx.contact?.email)
  const u = nameParts(ctx.user?.name, ctx.user?.email)
  return {
    "contact.name": c.full,
    "contact.first_name": c.first,
    "contact.last_name": c.last,
    "contact.email": ctx.contact?.email ?? "",
    "user.name": u.full,
    "user.first_name": u.first,
    "user.last_name": u.last,
    "user.email": ctx.user?.email ?? "",
    "user.title": ctx.user?.title ?? "",
    "org.name": ctx.org?.name ?? "",
  }
}

export function renderTemplate(html: string, ctx: TemplateContext): string {
  const values = templateValues(ctx)
  return html.replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/gi, (_m, key: string) => escapeHtml(values[key.toLowerCase()] ?? ""))
}
