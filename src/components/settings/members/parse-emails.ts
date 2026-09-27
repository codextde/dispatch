/**
 * Parse free-form invite input ("a@x.com, b@y.com\nJane Doe <c@z.com>") into
 * unique, lower-cased addresses. Shared by the invite dialog (live preview)
 * and the server (authoritative validation).
 */
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/

export function parseEmailList(raw: string | string[]): { valid: string[]; invalid: string[] } {
  const text = (Array.isArray(raw) ? raw.join("\n") : raw)
    .replace(/"[^"]*"/g, " ") // quoted display names
    .replace(/</g, " <")
    .replace(/>/g, "> ")
  const tokens = text.split(/[\s,;]+/).filter(Boolean)

  const valid: string[] = []
  const invalid: string[] = []
  const add = (t: string) => {
    const email = t.trim().replace(/^mailto:/i, "").toLowerCase()
    if (EMAIL_RE.test(email) && email.length <= 254) {
      if (!valid.includes(email)) valid.push(email)
    } else if (!invalid.includes(email)) invalid.push(email)
  }

  // Words without "@" directly before "<address>" are a display name ("Jane Doe <jane@…>")
  let words: string[] = []
  for (const token of tokens) {
    const bracketed = /^<(.*)>$/.exec(token)
    if (bracketed) {
      words = []
      if (bracketed[1]) add(bracketed[1])
    } else if (token.includes("@")) {
      words.forEach(add)
      words = []
      add(token)
    } else {
      words.push(token)
    }
  }
  words.forEach(add)
  return { valid, invalid }
}
