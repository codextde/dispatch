"use client"

import { useSyncExternalStore } from "react"

/**
 * Timestamps rendered in the viewer's own timezone, without hydration
 * mismatches.
 *
 * The server (and the hydration pass) can't know the browser's timezone or
 * clock, so they render a deterministic UTC string; right after hydration the
 * component re-renders in local time. Use it for every date shown in
 * server-rendered UI (server components and SSR'd client components):
 *
 *   <LocalTime date={row.createdAt} />                 // "Sep 27, 2026, 14:03"
 *   <LocalTime date={row.createdAt} format="date" />   // "Sep 27, 2026"
 *   <LocalTime date={session.lastUsedAt} format="relative" />  // "5 minutes ago"
 *
 * For strings outside JSX (e.g. `title` attributes) use `useLocalTimeFormatter()`.
 */

export type LocalTimeFormat = "datetime" | "date" | "time" | "relative" | "weekday-time"
type DateLike = Date | string | number | null | undefined

const noopSubscribe = () => () => {}

/** false during SSR and the hydration render, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )
}

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date
}

const OPTIONS: Record<Exclude<LocalTimeFormat, "relative">, Intl.DateTimeFormatOptions> = {
  datetime: { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  date: { month: "short", day: "numeric", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  "weekday-time": { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

function relative(date: Date): string {
  const diff = date.getTime() - Date.now()
  if (Math.abs(diff) < 45_000) return "just now"
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit)
  }
  return "just now"
}

/**
 * Format a date. `local = false` formats deterministically in UTC (safe for
 * SSR/hydration); `local = true` uses the browser's timezone and clock.
 */
export function formatLocalTime(d: DateLike, format: LocalTimeFormat = "datetime", local = true, fallback = "—"): string {
  const date = toDate(d)
  if (!date) return fallback
  if (format === "relative") {
    // Relative text depends on the viewer's clock: show the absolute UTC date until hydrated
    return local ? relative(date) : new Intl.DateTimeFormat("en-US", { ...OPTIONS.date, timeZone: "UTC" }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { ...OPTIONS[format], ...(local ? {} : { timeZone: "UTC" }) }).format(date)
}

/** Hook variant for attributes/strings: `const fmt = useLocalTimeFormatter(); title={fmt(d)}` */
export function useLocalTimeFormatter() {
  const hydrated = useHydrated()
  return (d: DateLike, format: LocalTimeFormat = "datetime", fallback = "—") => formatLocalTime(d, format, hydrated, fallback)
}

export function LocalTime({
  date,
  format = "datetime",
  fallback = "—",
  className,
  titleFormat,
}: {
  date: DateLike
  format?: LocalTimeFormat
  fallback?: string
  className?: string
  /** Show a full timestamp tooltip (e.g. for relative times) */
  titleFormat?: LocalTimeFormat
}) {
  const hydrated = useHydrated()
  const d = toDate(date)
  if (!d) return <span className={className}>{fallback}</span>
  return (
    <time
      dateTime={d.toISOString()}
      className={className}
      title={titleFormat ? formatLocalTime(d, titleFormat, hydrated) : undefined}
    >
      {formatLocalTime(d, format, hydrated, fallback)}
    </time>
  )
}
