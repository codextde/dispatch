"use client"

import { useMemo, useRef, useState } from "react"
import { ChartCard, DataTable } from "@/components/analytics/chart-card"
import { ChartEmpty } from "@/components/analytics/trend-charts"
import { formatHour, WEEKDAYS } from "@/components/analytics/format"
import { HEAT_STEPS, heatColor } from "@/components/analytics/palette"
import type { HeatmapCell } from "@/server/workspace/queries/analytics"

const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function BusiestHours({ cells, timezone }: { cells: HeatmapCell[]; timezone: string }) {
  const { grid, max, total, peak } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    let mx = 0
    let sum = 0
    let pk: HeatmapCell | null = null
    for (const c of cells) {
      if (c.weekday < 1 || c.weekday > 7 || c.hour < 0 || c.hour > 23) continue
      g[c.weekday - 1]![c.hour] = c.count
      sum += c.count
      if (c.count > mx) {
        mx = c.count
        pk = c
      }
    }
    return { grid: g, max: mx, total: sum, peak: pk }
  }, [cells])

  const [hover, setHover] = useState<{ day: number; hour: number; x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const step = (v: number) => (v <= 0 || max === 0 ? 0 : Math.max(1, Math.ceil((v / max) * HEAT_STEPS.length)))
  const peakText = peak ? `${WEEKDAYS[peak.weekday - 1]} ${formatHour(peak.hour)} (${peak.count.toLocaleString()} messages)` : ""

  return (
    <ChartCard
      title="Busiest hours"
      description={`Incoming emails by weekday and hour (${timezone.replace(/_/g, " ")}).`}
      table={
        <DataTable
          caption="Incoming emails by weekday and hour"
          columns={[{ key: "day", label: "Day" }, ...HOURS.map((h) => ({ key: String(h), label: String(h).padStart(2, "0"), align: "right" as const }))]}
          rows={grid.map((row, d) => ({
            day: WEEKDAYS[d]!.slice(0, 3),
            ...Object.fromEntries(row.map((v, h) => [String(h), v || ""])),
          }))}
        />
      }
    >
      {total === 0 ? (
        <ChartEmpty>No incoming emails in this period.</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          <div ref={wrapRef} className="relative -mx-1 overflow-x-auto px-1 pb-1" onPointerLeave={() => setHover(null)}>
            <div
              role="img"
              aria-label={`Heatmap of incoming emails by weekday and hour. Busiest: ${peakText}. Use the table view for exact values.`}
              className="grid min-w-[560px] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px]"
            >
              {grid.map((row, d) => (
                <div key={d} className="contents">
                  <div className="flex items-center pr-1.5 text-[11px] text-muted-foreground">{WEEKDAYS[d]!.slice(0, 3)}</div>
                  {row.map((v, h) => (
                    <div
                      key={h}
                      className="h-6 rounded-[3px] transition-[filter] hover:brightness-110 hover:ring-2 hover:ring-foreground/25 sm:h-7"
                      style={{ backgroundColor: heatColor(step(v)) }}
                      onPointerEnter={(e) => {
                        const wrap = wrapRef.current?.getBoundingClientRect()
                        const cell = e.currentTarget.getBoundingClientRect()
                        if (!wrap) return
                        setHover({
                          day: d,
                          hour: h,
                          x: cell.left - wrap.left + cell.width / 2 + (wrapRef.current?.scrollLeft ?? 0),
                          y: cell.top - wrap.top,
                        })
                      }}
                    />
                  ))}
                </div>
              ))}
              <div />
              {HOURS.map((h) => (
                <div key={h} className="pt-1 text-center text-[10px] text-muted-foreground tabular-nums">
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
            {hover && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
                style={{ left: hover.x, top: hover.y - 6 }}
              >
                <div className="font-mono font-semibold text-foreground tabular-nums">
                  {grid[hover.day]![hover.hour]!.toLocaleString()} {grid[hover.day]![hover.hour] === 1 ? "message" : "messages"}
                </div>
                <div className="text-muted-foreground">
                  {WEEKDAYS[hover.day]} · {formatHour(hover.hour)}–{formatHour((hover.hour + 1) % 24)}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Busiest: <span className="font-medium text-foreground">{peakText}</span>
            </span>
            <span className="flex items-center gap-1.5" aria-hidden>
              Less
              {[0, ...HEAT_STEPS.map((_, i) => i + 1)].map((s) => (
                <span key={s} className="size-3 rounded-[3px]" style={{ backgroundColor: heatColor(s) }} />
              ))}
              More
            </span>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
