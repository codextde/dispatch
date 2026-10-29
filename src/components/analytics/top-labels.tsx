"use client"

import { ChartCard, DataTable } from "@/components/analytics/chart-card"
import { ChartEmpty } from "@/components/analytics/trend-charts"
import { formatCount } from "@/components/analytics/format"
import type { LabelStat } from "@/server/workspace/queries/analytics"
import { useI18n } from "@/lib/i18n"

/**
 * Horizontal bars, one series (slot color); the label's own color is shown
 * as a dot beside its name for identity.
 */
export function TopLabels({ labels }: { labels: LabelStat[] }) {
  const { t, locale } = useI18n()
  const max = Math.max(1, ...labels.map((l) => l.count))
  return (
    <ChartCard
      title={t("topLabels")}
      description={t("topLabelsDescription")}
      table={
        <DataTable
          caption={t("analyticsTopLabelsCaption")}
          columns={[
            { key: "name", label: t("analyticsLabel") },
            { key: "count", label: t("analyticsConversations"), align: "right" },
          ]}
          rows={labels.map((l) => ({ name: l.name, count: formatCount(l.count) }))}
        />
      }
    >
      {labels.length === 0 ? (
        <ChartEmpty>{t("noLabeledConversations")}</ChartEmpty>
      ) : (
        <ul className="flex flex-col gap-2.5 pt-1">
          {labels.map((l) => {
            const pct = (l.count / max) * 100
            return (
              <li key={l.id} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
                <span className="flex min-w-0 items-center gap-2 text-[13px]">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="truncate" title={l.name}>
                    {l.name}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2" title={`${l.name}: ${l.count.toLocaleString(locale === "it" ? "it-IT" : "en-US")} ${t("analyticsConversationsTooltip")}`}>
                  <span
                    className="block h-3.5 shrink-0 rounded-r-[4px] transition-[filter] hover:brightness-110"
                    style={{ width: `max(calc((100% - 3rem) * ${pct / 100}), 3px)`, backgroundColor: "var(--viz-in)" }}
                  />
                  <span className="shrink-0 text-xs font-medium tabular-nums">{formatCount(l.count, "—", locale)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ChartCard>
  )
}
