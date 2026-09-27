import { format, formatDistanceToNowStrict, isThisYear, isToday, isTomorrow, isYesterday } from "date-fns"
import type { MemberSummary, Participant } from "./types"

/** Compact list timestamp: 14:05 · Yesterday · Mon · 12 Mar · 12 Mar 2024 */
export function listTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isToday(d)) return format(d, "HH:mm")
  if (isYesterday(d)) return "Yesterday"
  const days = (Date.now() - d.getTime()) / 86_400_000
  if (days < 6 && days > 0) return format(d, "EEE")
  return isThisYear(d) ? format(d, "d MMM") : format(d, "d MMM yyyy")
}

/** Timestamp in thread headers: "Today 14:05", "Mon 3 Mar, 09:12" */
export function threadTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isToday(d)) return `Today ${format(d, "HH:mm")}`
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`
  return isThisYear(d) ? format(d, "EEE d MMM, HH:mm") : format(d, "d MMM yyyy, HH:mm")
}

export function fullTime(iso: string | null | undefined): string {
  if (!iso) return ""
  return format(new Date(iso), "EEEE, d MMMM yyyy 'at' HH:mm")
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Math.abs(Date.now() - d.getTime()) < 45_000) return "just now"
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

/** "until tomorrow 09:00" style snooze label */
export function untilLabel(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isToday(d)) return `today ${format(d, "HH:mm")}`
  if (isTomorrow(d)) return `tomorrow ${format(d, "HH:mm")}`
  return isThisYear(d) ? format(d, "EEE d MMM, HH:mm") : format(d, "d MMM yyyy, HH:mm")
}

export function participantName(p: Participant | null | undefined): string {
  if (!p) return ""
  if (p.name?.trim()) return p.name.trim()
  return p.email
}

export function shortName(p: Participant | null | undefined): string {
  const name = participantName(p)
  if (!p?.name?.trim()) return name.split("@")[0] ?? name
  return name.split(/\s+/)[0] ?? name
}

export function memberName(m: Pick<MemberSummary, "name" | "email"> | null | undefined, fallback = "Someone"): string {
  if (!m) return fallback
  return m.name?.trim() || m.email.split("@")[0] || fallback
}

export function firstName(m: Pick<MemberSummary, "name" | "email"> | null | undefined): string {
  return memberName(m).split(/\s+/)[0] ?? ""
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function formatAddress(p: Participant): string {
  return p.name ? `${p.name} <${p.email}>` : p.email
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Parse "Name <a@b.c>", "a@b.c" or comma/semicolon separated lists. */
export function parseAddresses(input: string): Participant[] {
  const out: Participant[] = []
  for (const part of input.split(/[,;\n]+/)) {
    const raw = part.trim()
    if (!raw) continue
    const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
    if (m && isEmail(m[2]!)) out.push({ name: m[1]!.trim() || null, email: m[2]!.trim() })
    else if (isEmail(raw)) out.push({ name: null, email: raw })
  }
  return out
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`
}
