/** Formatting helpers for analytics (client + server safe). */

/** Seconds → "45s", "12m", "1h 24m", "2d 3h". */
export function formatDuration(seconds: number | null | undefined, fallback = "—"): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return fallback
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(s / 3600)
  const rm = Math.round((s - h * 3600) / 60)
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(s / 86_400)
  const rh = Math.round((s - d * 86_400) / 3600)
  return rh ? `${d}d ${rh}h` : `${d}d`
}

/** Compact integer: 1,284 / 12.9K / 4.2M */
export function formatCount(n: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return fallback
  if (Math.abs(n) < 10_000) return n.toLocaleString("en-US")
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

/** Parse YYYY-MM-DD as a local calendar date (no timezone shift). */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

export function toYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/*
 * Buckets and ranges are calendar dates already computed in the workspace
 * timezone. Labels treat them as UTC midnight and format in UTC, so they read
 * the same on the server and in every browser (no hydration drift, no DST shifts).
 */
function ymdToUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

/** Shift a YYYY-MM-DD date by whole calendar days. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(ymdToUtc(ymd).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const weekdayDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })

export function formatBucket(ymd: string, granularity: "day" | "week", long = false): string {
  const d = ymdToUtc(ymd)
  if (granularity === "week") return `Week of ${(long ? longDate : shortDate).format(d)}`
  return (long ? weekdayDate : shortDate).format(d)
}

/** "Aug 29 – Sep 27, 2026" for an inclusive-from / exclusive-to range. */
export function formatRangeLabel(from: string, toExclusive: string): string {
  const a = ymdToUtc(from)
  const b = ymdToUtc(addDaysYmd(toExclusive, -1))
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  return `${(sameYear ? shortDate : longDate).format(a)} – ${longDate.format(b)}`
}

export type Delta = { direction: "up" | "down" | "flat" | "new"; pct: number | null; good: boolean | null }

/**
 * Change vs the previous period. `lowerIsBetter` flips the good/bad reading
 * (response times). Returns null when there is nothing to compare.
 */
export function computeDelta(current: number | null, previous: number | null, lowerIsBetter = false): Delta | null {
  if (current === null || previous === null) return null
  if (previous === 0 && current === 0) return { direction: "flat", pct: 0, good: null }
  if (previous === 0) return { direction: "new", pct: null, good: lowerIsBetter ? null : true }
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return { direction: "flat", pct: 0, good: null }
  const up = pct > 0
  return { direction: up ? "up" : "down", pct, good: lowerIsBetter ? !up : up }
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const

export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`
}
