/**
 * Client-side CSV parsing for contact imports (RFC 4180: quoted fields,
 * escaped quotes, newlines inside quotes; auto-detects , ; or tab).
 */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const counts = [",", ";", "\t"].map((d) => ({ d, n: countOutsideQuotes(firstLine, d) }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0]!.n > 0 ? counts[0]!.d : ","
}

function countOutsideQuotes(line: string, ch: string) {
  let n = 0
  let quoted = false
  for (const c of line) {
    if (c === '"') quoted = !quoted
    else if (c === ch && !quoted) n++
  }
  return n
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === "") quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

export type ContactField = "email" | "name" | "firstName" | "lastName" | "company" | "title" | "phone" | "notes" | "tags"

export const FIELD_LABELS: Record<ContactField, string> = {
  email: "Email",
  name: "Full name",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  title: "Job title",
  phone: "Phone",
  notes: "Notes",
  tags: "Tags",
}

const HEADER_ALIASES: Record<ContactField, string[]> = {
  email: ["email", "e-mail", "email address", "e-mail address", "mail", "primary email", "email 1 - value", "emailaddress"],
  name: ["name", "full name", "fullname", "display name", "contact name", "contact"],
  firstName: ["first name", "firstname", "given name", "first"],
  lastName: ["last name", "lastname", "surname", "family name", "last"],
  company: ["company", "organization", "organisation", "company name", "organization 1 - name", "account", "employer"],
  title: ["title", "job title", "jobtitle", "position", "role", "organization 1 - title"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "telephone", "tel", "phone 1 - value", "work phone"],
  notes: ["notes", "note", "comments", "comment", "description"],
  tags: ["tags", "tag", "labels", "groups", "group membership", "segments"],
}

/** Guess which column holds which field; unknown columns map to null. */
export function guessMapping(headers: string[]): (ContactField | null)[] {
  const used = new Set<ContactField>()
  return headers.map((h) => {
    const key = h.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ")
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ContactField, string[]][]) {
      if (!used.has(field) && aliases.includes(key)) {
        used.add(field)
        return field
      }
    }
    if (!used.has("email") && key.includes("email")) {
      used.add("email")
      return "email"
    }
    return null
  })
}

export type ImportRow = {
  email: string
  name?: string
  company?: string
  title?: string
  phone?: string
  notes?: string
  tags?: string[]
  customFields?: Record<string, string>
}

/** Turn parsed rows into import payloads using the column mapping. Rows without an email are skipped. */
export function rowsToContacts(
  headers: string[],
  rows: string[][],
  mapping: (ContactField | null)[],
  opts: { customFields?: boolean } = {}
): ImportRow[] {
  const out: ImportRow[] = []
  for (const r of rows) {
    const get = (f: ContactField) => {
      const i = mapping.indexOf(f)
      return i >= 0 ? (r[i] ?? "").trim() : ""
    }
    const email = get("email").replace(/^mailto:/i, "")
    if (!email) continue
    const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")
    const row: ImportRow = { email }
    if (name) row.name = name
    for (const f of ["company", "title", "phone", "notes"] as const) {
      const v = get(f)
      if (v) row[f] = v
    }
    const tags = get("tags")
      .split(/[;,|]/)
      .map((t) => t.replace(/^\*\s*/, "").trim())
      .filter(Boolean)
    if (tags.length) row.tags = tags
    if (opts.customFields) {
      const custom: Record<string, string> = {}
      headers.forEach((h, i) => {
        if (mapping[i] === null && h.trim() && (r[i] ?? "").trim()) custom[h.trim()] = r[i]!.trim()
      })
      if (Object.keys(custom).length) row.customFields = custom
    }
    out.push(row)
  }
  return out
}

/** Minimal CSV cell escaping (used for client-side previews/exports). */
export function csvEscape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
