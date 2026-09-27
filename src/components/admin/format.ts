import { format, formatDistanceToNowStrict } from "date-fns"

type DateLike = Date | string | number | null | undefined

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "3 hours ago" / "in 5 days" */
export function timeAgo(d: DateLike, fallback = "—") {
  const date = toDate(d)
  if (!date) return fallback
  if (Math.abs(Date.now() - date.getTime()) < 45_000) return "just now"
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

/** "Sep 27, 2026" */
export function formatDate(d: DateLike, fallback = "—") {
  const date = toDate(d)
  return date ? format(date, "MMM d, yyyy") : fallback
}

/** "Sep 27, 2026, 14:03" */
export function formatDateTime(d: DateLike, fallback = "—") {
  const date = toDate(d)
  return date ? format(date, "MMM d, yyyy, HH:mm") : fallback
}

/** ISO string for <time dateTime> */
export function isoOrUndefined(d: DateLike) {
  return toDate(d)?.toISOString()
}
