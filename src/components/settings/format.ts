import { format, formatDistanceToNowStrict, isValid } from "date-fns"

type DateLike = Date | string | number | null | undefined

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null
  const date = d instanceof Date ? d : new Date(d)
  return isValid(date) ? date : null
}

/** "3 minutes ago", "in 2 days" */
export function fromNow(d: DateLike, fallback = "—"): string {
  const date = toDate(d)
  if (!date) return fallback
  if (Math.abs(Date.now() - date.getTime()) < 45_000) return "just now"
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

/** "Sep 27, 2026" */
export function formatDate(d: DateLike, fallback = "—"): string {
  const date = toDate(d)
  return date ? format(date, "MMM d, yyyy") : fallback
}

/** "Sep 27, 2026, 14:03" */
export function formatDateTime(d: DateLike, fallback = "—"): string {
  const date = toDate(d)
  return date ? format(date, "MMM d, yyyy, HH:mm") : fallback
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
