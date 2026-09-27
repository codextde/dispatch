import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react"
import { MicroLabel } from "@/components/settings/settings-ui"
import { computeDelta, formatCount, formatDuration, type Delta } from "@/components/analytics/format"
import type { AnalyticsKpis, SeriesPoint } from "@/server/workspace/queries/analytics"
import { cn } from "@/lib/utils"

function DeltaChip({ delta, periodLabel }: { delta: Delta | null; periodLabel: string }) {
  if (!delta) return <span className="text-xs text-muted-foreground">No data to compare</span>
  const tone =
    delta.good === null
      ? "bg-muted text-muted-foreground"
      : delta.good
        ? "bg-success/12 text-[color-mix(in_oklch,var(--success),var(--foreground)_35%)]"
        : "bg-destructive/10 text-destructive"
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : delta.direction === "new" ? Sparkles : Minus
  const text =
    delta.direction === "new"
      ? "New"
      : delta.direction === "flat"
        ? "0%"
        : `${delta.pct! > 0 ? "+" : "−"}${Math.abs(delta.pct!) >= 100 ? Math.round(Math.abs(delta.pct!)) : Math.abs(delta.pct!).toFixed(1).replace(/\.0$/, "")}%`
  const verdict = delta.good === null ? "" : delta.good ? ", better" : ", worse"
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      <span
        className={cn("inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 font-medium tabular-nums", tone)}
        aria-label={`${text} vs ${periodLabel}${verdict}`}
      >
        <Icon className="size-3" aria-hidden />
        {text}
      </span>
      <span>vs {periodLabel}</span>
    </span>
  )
}

/** Tiny trend line: muted line, current (last) point in the series color. */
function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null)
  if (pts.length < 2) return <div className="h-7" aria-hidden />
  const w = 96
  const h = 28
  const pad = 3
  const max = Math.max(...pts.map((p) => p.v))
  const min = Math.min(...pts.map((p) => p.v))
  const span = max - min || 1
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)
  const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")
  const last = pts[pts.length - 1]!
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hidden h-7 w-24 shrink-0 overflow-visible sm:block" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className="text-muted-foreground/45" />
      <circle cx={x(last.i)} cy={y(last.v)} r={3} fill={color} stroke="var(--card)" strokeWidth={2} />
    </svg>
  )
}

function Tile({
  label,
  value,
  sub,
  spark,
  hint,
}: {
  label: string
  value: string
  sub: React.ReactNode
  spark?: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]" title={hint}>
      <MicroLabel className="truncate">{label}</MicroLabel>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl leading-none font-semibold tracking-tight whitespace-nowrap sm:text-[28px]">{value}</span>
        {spark}
      </div>
      <div className="min-w-0">{sub}</div>
    </div>
  )
}

export function KpiTiles({ kpis, series, days }: { kpis: AnalyticsKpis; series: SeriesPoint[]; days: number }) {
  const period = `prev. ${days}d`
  const tail = series.slice(-14)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <Tile
        label="Received"
        value={formatCount(kpis.received.current)}
        sub={<DeltaChip delta={computeDelta(kpis.received.current, kpis.received.previous)} periodLabel={period} />}
        spark={<Sparkline values={tail.map((p) => p.received)} color="var(--viz-in)" />}
        hint="New conversations with at least one incoming email"
      />
      <Tile
        label="Replies sent"
        value={formatCount(kpis.replies.current)}
        sub={<DeltaChip delta={computeDelta(kpis.replies.current, kpis.replies.previous)} periodLabel={period} />}
        spark={<Sparkline values={tail.map((p) => p.replied)} color="var(--viz-out)" />}
        hint="Emails sent by teammates"
      />
      <Tile
        label="First response"
        value={formatDuration(kpis.medianFirstResponse.current)}
        sub={
          <DeltaChip
            delta={computeDelta(kpis.medianFirstResponse.current, kpis.medianFirstResponse.previous, true)}
            periodLabel={period}
          />
        }
        spark={<Sparkline values={tail.map((p) => p.medianFirstResponse)} color="var(--viz-out)" />}
        hint="Median time from a new conversation to the first reply"
      />
      <Tile
        label="Resolution time"
        value={formatDuration(kpis.medianResolution.current)}
        sub={
          <DeltaChip
            delta={computeDelta(kpis.medianResolution.current, kpis.medianResolution.previous, true)}
            periodLabel={period}
          />
        }
        hint="Median time from a new conversation to closing it"
      />
      <Tile
        label="Open now"
        value={formatCount(kpis.open)}
        sub={<span className="text-xs text-muted-foreground">Right now · excl. snoozed</span>}
        hint="Conversations currently open (not snoozed)"
      />
      <Tile
        label="Closed"
        value={formatCount(kpis.closed.current)}
        sub={<DeltaChip delta={computeDelta(kpis.closed.current, kpis.closed.previous)} periodLabel={period} />}
        hint="Conversations closed in this period"
      />
    </div>
  )
}
