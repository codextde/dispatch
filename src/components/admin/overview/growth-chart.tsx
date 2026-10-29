"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type GrowthPoint = { day: string; signups: number; workspaces: number }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-09-27" → "Sep 27" (parsed manually: no timezone shifts, SSR-stable). */
function shortDay(day: string, locale: "en" | "it" = "en") {
  const [, m, d] = day.split("-").map(Number)
  const month = locale === "it" ? ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][(m ?? 1) - 1] : MONTHS[(m ?? 1) - 1]
  return `${month} ${d}`
}

function longDay(day: string, locale: "en" | "it" = "en") {
  const [y, m, d] = day.split("-").map(Number)
  const localeName = locale === "it" ? "it-IT" : "en-US"
  const weekday = new Date(Date.UTC(y!, (m ?? 1) - 1, d)).toLocaleDateString(localeName, { weekday: "short", timeZone: "UTC" })
  return `${weekday}, ${shortDay(day, locale)}`
}

/*
 * One hue (signal green) validated with the dataviz palette checks:
 * light #1a9951 on #fff and dark #28ad5e on #1b1b1b both clear 3:1 contrast
 * and the lightness band. Each small multiple plots a single series, so the
 * panel title names it and no legend is needed.
 */
const SERIES_COLOR = {
  light: "oklch(0.6 0.15 152)",
  dark: "oklch(0.66 0.16 152)",
}

function Delta({ current, previous, locale }: { current: number; previous: number; locale: "en" | "it" }) {
  const diff = current - previous
  if (current === 0 && previous === 0) return <span className="text-muted-foreground">{locale === "it" ? "Nessuna variazione" : "No change"}</span>
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±"
  return (
    <span className={cn("text-muted-foreground", diff > 0 && "text-emerald-700 dark:text-emerald-400")}>
      {sign}
      {Math.abs(diff)} {locale === "it" ? "rispetto ai 30 giorni precedenti" : "vs previous 30 days"}
    </span>
  )
}

function SeriesChart({
  dataKey,
  title,
  total,
  previous,
  points,
  locale,
}: {
  dataKey: "signups" | "workspaces"
  title: string
  total: number
  previous: number
  points: GrowthPoint[]
  locale: "en" | "it"
}) {
  const chartConfig = { signups: { label: locale === "it" ? "Nuovi utenti" : "New users", theme: SERIES_COLOR }, workspaces: { label: locale === "it" ? "Nuovi workspace" : "New workspaces", theme: SERIES_COLOR } } satisfies ChartConfig
  // Weekly ticks counted back from today so the latest day is always labeled
  const ticks = points.filter((_, i) => (points.length - 1 - i) % 7 === 0).map((p) => p.day)
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-2xl font-semibold tracking-tight">{total.toLocaleString("en-US")}</span>
          <span className="text-xs">
            <Delta current={total} previous={previous} locale={locale} />
          </span>
        </div>
      </figcaption>
      <div className="relative">
        <ChartContainer config={chartConfig} className="aspect-auto h-36 w-full" initialDimension={{ width: 560, height: 144 }}>
          <BarChart data={points} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={2} accessibilityLayer>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis
              dataKey="day"
              ticks={ticks}
              tickFormatter={(day: string) => shortDay(day, locale)}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              fontSize={11}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={28}
              fontSize={11}
              tickFormatter={(v: number) => v.toLocaleString("en-US")}
              domain={[0, (max: number) => Math.max(4, Math.ceil(max / 4) * 4)]}
              tickCount={5}
            />
            <ChartTooltip
              cursor={{ fillOpacity: 0.6 }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const day = payload?.[0]?.payload?.day as string | undefined
                    return day ? longDay(day, locale) : ""
                  }}
                />
              }
            />
            <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
        {total === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-muted-foreground">
            {locale === "it" ? "Nessun dato negli ultimi 30 giorni" : "Nothing in the last 30 days"}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Signups & workspaces created per day as two small multiples, with a table view. */
export function GrowthChart({
  points,
  totals,
  previous,
}: {
  points: GrowthPoint[]
  totals: { signups: number; workspaces: number }
  previous: { signups: number; workspaces: number }
}) {
  const { locale } = useI18n()
  const [view, setView] = useState<"chart" | "table">("chart")
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{locale === "it" ? "Giornaliero, ultimi 30 giorni" : "Daily, last 30 days"}</p>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as "chart" | "table")}
          aria-label={locale === "it" ? "Visualizzazione crescita" : "Growth view"}
        >
          <ToggleGroupItem value="chart" className="px-2.5 text-xs">
            {locale === "it" ? "Grafico" : "Chart"}
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="px-2.5 text-xs">
            {locale === "it" ? "Tabella" : "Table"}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "chart" ? (
        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-1 lg:gap-6">
          <SeriesChart dataKey="signups" title={locale === "it" ? "Nuovi utenti" : "New users"} total={totals.signups} previous={previous.signups} points={points} locale={locale} />
          <SeriesChart
            dataKey="workspaces"
            title={locale === "it" ? "Nuovi workspace" : "New workspaces"}
            total={totals.workspaces}
            previous={previous.workspaces}
            points={points}
            locale={locale}
          />
        </div>
      ) : (
        <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{locale === "it" ? "Nuovi utenti e workspace al giorno, ultimi 30 giorni" : "New users and workspaces per day, last 30 days"}</caption>
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-mono text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  {locale === "it" ? "Giorno" : "Day"}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right font-mono text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  {locale === "it" ? "Nuovi utenti" : "New users"}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right font-mono text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  {locale === "it" ? "Nuovi workspace" : "New workspaces"}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="px-3 py-1.5 text-[13px]">{longDay(p.day, locale)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.signups}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.workspaces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
