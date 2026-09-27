import Link from "next/link"
import { ChartNoAxesColumn } from "lucide-react"
import { z } from "zod"
import { can, requireOrgPage, requirePagePermission } from "@/server/authz"
import {
  addDays,
  buildRange,
  getAnalyticsOptions,
  getAnalyticsReport,
  hasAnalyticsData,
  isYmd,
  resolveTimezone,
  todayIn,
  type AnalyticsFilters,
} from "@/server/workspace/queries/analytics"
import { AnalyticsView, type AnalyticsFilterState } from "@/components/analytics/analytics-view"
import { KpiTiles } from "@/components/analytics/kpi-tiles"
import { ResponseTimeChart, VolumeChart } from "@/components/analytics/trend-charts"
import { TopLabels } from "@/components/analytics/top-labels"
import { BusiestHours } from "@/components/analytics/busiest-hours"
import { InboxesTable, TeammatesTable } from "@/components/analytics/stats-tables"
import { vizVars } from "@/components/analytics/palette"
import { EmptyState, MicroLabel } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const uuid = z.uuid()

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/w/[slug]/analytics">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "analytics.view")
  const sp = await searchParams

  const [tz, options, hasData] = await Promise.all([
    resolveTimezone(ctx.org.settings?.timezone),
    getAnalyticsOptions(ctx.org.id),
    hasAnalyticsData(ctx.org.id),
  ])

  // Range: 7 | 30 (default) | 90 | custom (from/to inclusive local dates)
  const rawRange = first(sp.range)
  const rawFrom = first(sp.from)
  const rawTo = first(sp.to)
  const preset = rawRange === "7" || rawRange === "90" ? rawRange : "30"
  const custom = rawRange === "custom" && isYmd(rawFrom) && isYmd(rawTo)
  const range = custom ? buildRange(tz, { from: rawFrom, to: rawTo }) : buildRange(tz, { preset: Number(preset) as 7 | 30 | 90 })

  // Filters: only ids that belong to this workspace (shared inboxes, teams, members)
  const pick = (raw: string | undefined, ids: string[]) => (raw && uuid.safeParse(raw).success && ids.includes(raw) ? raw : undefined)
  const filters: AnalyticsFilters = {
    accountId: pick(first(sp.inbox), options.accounts.map((a) => a.id)),
    teamId: pick(first(sp.team), options.teams.map((t) => t.id)),
    userId: pick(first(sp.user), options.members.map((m) => m.id)),
  }

  const filterState: AnalyticsFilterState = {
    range: custom ? "custom" : preset,
    from: range.from,
    to: addDays(range.to, -1),
    inbox: filters.accountId ?? null,
    team: filters.teamId ?? null,
    user: filters.userId ?? null,
  }

  const report = hasData ? await getAnalyticsReport(ctx.org.id, range, filters) : null

  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 md:pt-8 lg:px-10", vizVars)}>
      <header className="mb-6">
        <MicroLabel className="mb-2 block">Reports</MicroLabel>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[28px] sm:leading-tight">
          Analytics <span className="text-quiet">— how your team is doing</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground">
          Volume, responsiveness and workload across your shared inboxes. Times are shown in{" "}
          <span className="font-medium text-foreground">{tz.replace(/_/g, " ")}</span>.
        </p>
      </header>

      {!report ? (
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title={options.accounts.length === 0 ? "Connect a shared inbox to see analytics" : "No conversations yet"}
          description={
            options.accounts.length === 0
              ? "Analytics cover your team's shared inboxes. Once a shared inbox is connected and emails arrive, you'll see volume, response times and workload here."
              : "As soon as emails arrive in your shared inboxes, you'll see volume, response times, busiest hours and per-teammate stats here."
          }
          className="py-16"
        >
          {can(ctx, "inboxes.manage") && (
            <Button asChild size="sm">
              <Link href={`/w/${slug}/settings/inboxes`}>{options.accounts.length === 0 ? "Connect an inbox" : "Manage inboxes"}</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <AnalyticsView filters={filterState} options={options} today={todayIn(tz)}>
          <div className="flex flex-col gap-4">
            <KpiTiles kpis={report.kpis} series={report.series} days={range.days} />
            <VolumeChart series={report.series} granularity={range.granularity} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ResponseTimeChart series={report.series} granularity={range.granularity} />
              <TopLabels labels={report.labels} />
            </div>
            <BusiestHours cells={report.heatmap} timezone={tz} />
            <TeammatesTable rows={report.teammates} />
            <InboxesTable rows={report.inboxes} />
          </div>
        </AnalyticsView>
      )}
    </div>
  )
}
