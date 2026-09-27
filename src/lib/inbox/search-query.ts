/**
 * Gmail-like search query parser (isomorphic).
 *
 *   from:anna@acme.com to:support subject:"invoice 42" has:attachment
 *   is:unread is:read is:open is:closed is:starred is:snoozed is:assigned is:unassigned
 *   label:billing assignee:me assignee:maya@acme.com in:trash in:spam before:2026-01-31 after:2026-01-01
 *
 * Everything that is not an operator becomes free text (full-text search over
 * subject, snippet and message bodies).
 */
export type ParsedSearch = {
  text: string
  from: string[]
  to: string[]
  subject: string[]
  label: string[]
  assignee: string[]
  hasAttachment?: boolean
  is: Set<string>
  in: Set<string>
  before?: Date
  after?: Date
}

const OPERATORS = new Set(["from", "to", "subject", "label", "assignee", "has", "is", "in", "before", "after"])

function tokenize(input: string): string[] {
  const tokens: string[] = []
  const re = /(\w+):"([^"]*)"|(\w+):(\S+)|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) {
    if (m[1] !== undefined) tokens.push(`${m[1]}:${m[2]}`)
    else if (m[3] !== undefined) tokens.push(`${m[3]}:${m[4]}`)
    else if (m[5] !== undefined) tokens.push(m[5])
    else if (m[6] !== undefined) tokens.push(m[6])
  }
  return tokens
}

function parseDate(value: string): Date | undefined {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function parseSearch(input: string): ParsedSearch {
  const out: ParsedSearch = {
    text: "",
    from: [],
    to: [],
    subject: [],
    label: [],
    assignee: [],
    is: new Set(),
    in: new Set(),
  }
  const free: string[] = []
  for (const token of tokenize(input.slice(0, 500))) {
    const idx = token.indexOf(":")
    const op = idx > 0 ? token.slice(0, idx).toLowerCase() : ""
    const value = idx > 0 ? token.slice(idx + 1).trim() : ""
    if (!op || !OPERATORS.has(op) || !value) {
      free.push(token)
      continue
    }
    switch (op) {
      case "from":
      case "to":
      case "subject":
      case "label":
      case "assignee":
        out[op].push(value)
        break
      case "has":
        if (/^attachments?$/i.test(value)) out.hasAttachment = true
        break
      case "is":
        out.is.add(value.toLowerCase())
        break
      case "in":
        out.in.add(value.toLowerCase())
        break
      case "before":
        out.before = parseDate(value)
        break
      case "after":
        out.after = parseDate(value)
        break
    }
  }
  out.text = free.join(" ").trim()
  return out
}

export function hasSearchCriteria(p: ParsedSearch) {
  return Boolean(
    p.text ||
      p.from.length ||
      p.to.length ||
      p.subject.length ||
      p.label.length ||
      p.assignee.length ||
      p.hasAttachment ||
      p.is.size ||
      p.in.size ||
      p.before ||
      p.after
  )
}

/** Operator hints shown in the command palette. */
export const SEARCH_HINTS: { token: string; description: string }[] = [
  { token: "from:", description: "Sender email or name" },
  { token: "to:", description: "Recipient" },
  { token: "subject:", description: "Words in the subject" },
  { token: "has:attachment", description: "With attachments" },
  { token: "is:unread", description: "Unread conversations" },
  { token: "is:closed", description: "Closed conversations" },
  { token: "is:starred", description: "Starred by you" },
  { token: "label:", description: "With a label" },
  { token: "assignee:me", description: "Assigned to you" },
]
