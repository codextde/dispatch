"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { ChartCard, DataTable, Legend } from "@/components/analytics/chart-card"
import { formatBucket, formatCount, formatDuration } from "@/components/analytics/format"
import type { SeriesPoint } from "@/server/workspace/queries/analytics"
import { useI18n } from "@/lib/i18n"

type Granularity = "day" | "week"

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const

export function VolumeChart({ series, granularity }: { series: SeriesPoint[]; granularity: Granularity }) {
  const { t, locale } = useI18n()
  const total = series.reduce((a, p) => a + p.received + p.replied, 0)
  return (
    <ChartCard
      title={t("conversationVolume")}
      description={t("analyticsDescriptionVolume").replace("{granularity}", t(granularity === "week" ? "analyticsWeek" : "analyticsDayLabel").toLowerCase())}
      legend={
        <Legend
          items={[
            { label: t("received"), color: "var(--viz-in)" },
            { label: t("repliesSent"), color: "var(--viz-out)" },
          ]}
        />
      }
      table={
        <DataTable
          caption={t("analyticsChartVolumeCaption")}
          columns={[
            { key: "date", label: t(granularity === "week" ? "analyticsWeek" : "analyticsDayLabel") },
            { key: "received", label: t("analyticsReceived"), align: "right" },
            { key: "replied", label: t("repliesSent"), align: "right" },
          ]}
          rows={series.map((p) => ({
            date: formatBucket(p.date, granularity, true),
            received: formatCount(p.received),
            replied: formatCount(p.replied),
          }))}
        />
      }
    >
      {total === 0 ? (
        <ChartEmpty>{t("noConversationReplies")}</ChartEmpty>
      ) : (
        <ChartContainer config={{ received: { label: t("analyticsReceived"), color: "var(--viz-in)" }, replied: { label: t("repliesSent"), color: "var(--viz-out)" } }} className="aspect-auto h-[260px] w-full">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" {...axisProps} minTickGap={28} tickFormatter={(v: string) => formatBucket(v, granularity, false, locale)} />
            <YAxis {...axisProps} width={40} allowDecimals={false} tickFormatter={(v: number) => formatCount(v, "—", locale)} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => formatBucket(String(value), granularity, true, locale)}
                />
              }
            />
            <Line
              dataKey="received"
              type="monotone"
              stroke="var(--color-received)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
            <Line
              dataKey="replied"
              type="monotone"
              stroke="var(--color-replied)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

/** Pick a readable unit for the y-axis from the largest value (seconds). */
function durationUnit(maxSeconds: number): { div: number; suffix: string } {
  if (maxSeconds < 2 * 3600) return { div: 60, suffix: "m" }
  if (maxSeconds < 72 * 3600) return { div: 3600, suffix: "h" }
  return { div: 86_400, suffix: "d" }
}

export function ResponseTimeChart({ series, granularity }: { series: SeriesPoint[]; granularity: Granularity }) {
  const { t, locale } = useI18n()
  const values = series.map((p) => p.medianFirstResponse).filter((v): v is number => v !== null)
  const unit = durationUnit(values.length ? Math.max(...values) : 0)
  const data = useMemo(
    () =>
      series.map((p) => ({
        date: p.date,
        seconds: p.medianFirstResponse,
        medianHours: p.medianFirstResponse === null ? null : Math.round((p.medianFirstResponse / unit.div) * 10) / 10,
      })),
    [series, unit.div]
  )
  return (
    <ChartCard
      title={t("firstResponseTime")}
      description={t("analyticsDescriptionResponse").replace("{granularity}", t(granularity === "week" ? "analyticsWeek" : "analyticsDayLabel").toLowerCase())}
      table={
        <DataTable
          caption={t("analyticsResponseCaption")}
          columns={[
            { key: "date", label: t(granularity === "week" ? "analyticsWeek" : "analyticsDayLabel") },
            { key: "value", label: t("analyticsMedianFirstReplyLegend"), align: "right" },
          ]}
          rows={series.map((p) => ({
            date: formatBucket(p.date, granularity, true),
            value: formatDuration(p.medianFirstResponse),
          }))}
        />
      }
    >
      {values.length === 0 ? (
        <ChartEmpty>{t("noAnsweredConversations")}</ChartEmpty>
      ) : (
        <ChartContainer config={{ medianHours: { label: t("analyticsMedianFirstReplyLegend"), color: "var(--viz-out)" } }} className="aspect-auto h-[220px] w-full">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" {...axisProps} minTickGap={28} tickFormatter={(v: string) => formatBucket(v, granularity, false, locale)} />
            <YAxis {...axisProps} width={40} tickFormatter={(v: number) => `${v}${unit.suffix}`} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => formatBucket(String(value), granularity, true, locale)}
                  formatter={(_value, _name, item) => {
                    const seconds = (item.payload as { seconds: number | null }).seconds
                    return (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: "var(--viz-out)" }} aria-hidden />
                          {t("analyticsMedianFirstReplyLegend")}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">{formatDuration(seconds)}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Line
              dataKey="medianHours"
              type="monotone"
              stroke="var(--color-medianHours)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
              dot={values.length < 4 ? { r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--color-medianHours)" } : false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed bg-surface/40 px-4 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  )
}
