import Link from "next/link"
import type { Metadata } from "next"
import { Activity, ArrowRight, Building2, CircleDollarSign, Inbox, MessagesSquare, Send, UserCheck, Users } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import {
  getGrowthSeries,
  getOverviewStats,
  getRevenueEstimate,
  getSetupChecklist,
  listRecentWorkspaces,
} from "@/server/admin/overview"
import { listAuditEvents } from "@/server/admin/audit"
import { Button } from "@/components/ui/button"
import { AdminPageHeader, Panel, StatTile, formatMoney, formatNumber } from "@/components/admin/ui"
import { GrowthChart } from "@/components/admin/overview/growth-chart"
import { SetupChecklist } from "@/components/admin/overview/setup-checklist"
import { RecentAuditList, RecentWorkspacesList } from "@/components/admin/overview/recent-lists"

// Same segment as the admin layout, so its title template doesn't apply here
export const metadata: Metadata = {
  title: { absolute: "Overview · Instance admin" },
}

function greeting(timeZone: string) {
  let hour = new Date().getUTCHours()
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone,
      }).format(new Date()),
    )
  } catch {
    /* invalid time zone → UTC */
  }
  if (hour < 5) return "Good evening"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default async function AdminOverviewPage() {
  const { user } = await requireSuperAdminPage()
  const [general, stats, growth, checklist, recentWorkspaces, recentAudit] = await Promise.all([
    getSettings("general"),
    getOverviewStats(),
    getGrowthSeries(30),
    getSetupChecklist(),
    listRecentWorkspaces(6),
    listAuditEvents({ pageSize: 8 }),
  ])
  const revenue = await getRevenueEstimate(stats.payingWorkspaces)
  const firstName = (user.name || user.email.split("@")[0] || "").split(/\s+/)[0]
  const activeShare = stats.users ? Math.round((stats.activeUsers7d / stats.users) * 100) : 0

  return (
    <>
      <AdminPageHeader
        eyebrow={general.instanceName}
        title={`${greeting(user.timezone || general.defaultTimezone)}, ${firstName}.`}
        quiet="Here's how your instance is doing."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/system">
                <Activity /> System health
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/workspaces">
                Workspaces <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Workspaces"
          value={formatNumber(stats.workspaces)}
          hint={`+${formatNumber(stats.newWorkspaces7d)} this week${stats.suspendedWorkspaces ? ` · ${stats.suspendedWorkspaces} suspended` : ""}`}
          icon={Building2}
          href="/admin/workspaces"
        />
        <StatTile
          label="Users"
          value={formatNumber(stats.users)}
          hint={`+${formatNumber(stats.newUsers7d)} this week`}
          icon={Users}
          href="/admin/users"
        />
        <StatTile
          label="Active · 7d"
          value={formatNumber(stats.activeUsers7d)}
          hint={stats.users ? `${activeShare}% of users` : "No users yet"}
          icon={UserCheck}
        />
        <StatTile
          label="Conversations"
          value={formatNumber(stats.conversations)}
          hint={`${formatNumber(stats.openConversations)} open`}
          icon={MessagesSquare}
        />
        <StatTile label="Messages · 24h" value={formatNumber(stats.messages24h)} hint="Received and sent" icon={Send} />
        <StatTile
          label="Inboxes"
          value={formatNumber(stats.inboxes)}
          hint={
            stats.inboxes
              ? `${formatNumber(stats.inboxesActive)} active${stats.inboxesError ? ` · ${formatNumber(stats.inboxesError)} with errors` : ""}`
              : "Demo inboxes excluded"
          }
          tone={stats.inboxesError ? "error" : "default"}
          icon={Inbox}
          href={stats.inboxesError ? "/admin/system#inbox-errors" : undefined}
        />
        <StatTile
          label="Paying"
          value={formatNumber(stats.payingWorkspaces)}
          hint={revenue.enabled ? `${formatNumber(stats.trialingWorkspaces)} in trial` : "Billing disabled"}
          icon={CircleDollarSign}
        />
        <StatTile
          label="MRR (est.)"
          value={revenue.enabled ? formatMoney(revenue.mrrCents, revenue.currency) : "—"}
          hint={
            revenue.enabled
              ? `${formatMoney(revenue.priceCents, revenue.currency)}/${revenue.interval} × ${formatNumber(stats.payingWorkspaces)}`
              : general.mode === "saas"
                ? "Billing not enabled"
                : "Private mode"
          }
          tone={revenue.enabled && revenue.mrrCents > 0 ? "brand" : "default"}
          icon={CircleDollarSign}
          href={revenue.enabled ? undefined : "/admin/settings/billing"}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Growth" description="New users and workspaces per day" className="lg:col-span-2">
          <GrowthChart points={growth.points} totals={growth.totals} previous={growth.previous} />
        </Panel>
        <Panel title="Setup checklist" description="What this instance still needs">
          <SetupChecklist items={checklist} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Recent workspaces"
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link href="/admin/workspaces">
                View all <ArrowRight />
              </Link>
            </Button>
          }
        >
          <RecentWorkspacesList workspaces={recentWorkspaces} />
        </Panel>
        <Panel
          title="Recent activity"
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link href="/admin/audit">
                Audit log <ArrowRight />
              </Link>
            </Button>
          }
        >
          <RecentAuditList events={recentAudit.rows} />
        </Panel>
      </div>
    </>
  )
}
