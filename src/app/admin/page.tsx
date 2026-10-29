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

function greeting(timeZone: string, locale: string) {
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
  if (locale === "it") return hour >= 5 && hour < 12 ? "Buongiorno" : hour < 18 && hour >= 12 ? "Buon pomeriggio" : "Buonasera"
  if (hour < 5) return "Good evening"
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default async function AdminOverviewPage() {
  const { user } = await requireSuperAdminPage()
  const it = user.locale === "it"
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
        title={`${greeting(user.timezone || general.defaultTimezone, user.locale ?? "en")}, ${firstName}.`}
        quiet={it ? "Ecco come sta andando la tua istanza." : "Here's how your instance is doing."}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/system">
                <Activity /> {it ? "Stato del sistema" : "System health"}
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/workspaces">
                {it ? "Workspace" : "Workspaces"} <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label={it ? "Metriche principali" : "Key metrics"} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={it ? "Workspace" : "Workspaces"}
          value={formatNumber(stats.workspaces)}
          hint={`+${formatNumber(stats.newWorkspaces7d)} ${it ? "questa settimana" : "this week"}${stats.suspendedWorkspaces ? ` · ${stats.suspendedWorkspaces} ${it ? "sospesi" : "suspended"}` : ""}`}
          icon={Building2}
          href="/admin/workspaces"
        />
        <StatTile
          label={it ? "Utenti" : "Users"}
          value={formatNumber(stats.users)}
          hint={`+${formatNumber(stats.newUsers7d)} ${it ? "questa settimana" : "this week"}`}
          icon={Users}
          href="/admin/users"
        />
        <StatTile
          label={it ? "Attivi · 7 gg" : "Active · 7d"}
          value={formatNumber(stats.activeUsers7d)}
          hint={stats.users ? `${activeShare}% ${it ? "degli utenti" : "of users"}` : (it ? "Nessun utente" : "No users yet")}
          icon={UserCheck}
        />
        <StatTile
          label={it ? "Conversazioni" : "Conversations"}
          value={formatNumber(stats.conversations)}
          hint={`${formatNumber(stats.openConversations)} ${it ? "aperte" : "open"}`}
          icon={MessagesSquare}
        />
        <StatTile label={it ? "Messaggi · 24 h" : "Messages · 24h"} value={formatNumber(stats.messages24h)} hint={it ? "Ricevuti e inviati" : "Received and sent"} icon={Send} />
        <StatTile
          label={it ? "Caselle" : "Inboxes"}
          value={formatNumber(stats.inboxes)}
          hint={
            stats.inboxes
              ? `${formatNumber(stats.inboxesActive)} ${it ? "attive" : "active"}${stats.inboxesError ? ` · ${formatNumber(stats.inboxesError)} ${it ? "con errori" : "with errors"}` : ""}`
              : (it ? "Caselle demo escluse" : "Demo inboxes excluded")
          }
          tone={stats.inboxesError ? "error" : "default"}
          icon={Inbox}
          href={stats.inboxesError ? "/admin/system#inbox-errors" : undefined}
        />
        <StatTile
          label={it ? "A pagamento" : "Paying"}
          value={formatNumber(stats.payingWorkspaces)}
          hint={revenue.enabled ? `${formatNumber(stats.trialingWorkspaces)} ${it ? "in prova" : "in trial"}` : (it ? "Fatturazione disattivata" : "Billing disabled")}
          icon={CircleDollarSign}
        />
        <StatTile
          label="MRR (stima)"
          value={revenue.enabled ? formatMoney(revenue.mrrCents, revenue.currency) : "—"}
          hint={
            revenue.enabled
              ? `${formatMoney(revenue.priceCents, revenue.currency)}/${revenue.interval} × ${formatNumber(stats.payingWorkspaces)}`
              : general.mode === "saas"
                ? (it ? "Fatturazione non attiva" : "Billing not enabled")
                : (it ? "Modalità privata" : "Private mode")
          }
          tone={revenue.enabled && revenue.mrrCents > 0 ? "brand" : "default"}
          icon={CircleDollarSign}
          href={revenue.enabled ? undefined : "/admin/settings/billing"}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title={it ? "Crescita" : "Growth"} description={it ? "Nuovi utenti e workspace al giorno" : "New users and workspaces per day"} className="lg:col-span-2">
          <GrowthChart points={growth.points} totals={growth.totals} previous={growth.previous} />
        </Panel>
        <Panel title={it ? "Configurazione" : "Setup checklist"} description={it ? "Elementi ancora da configurare nell’istanza" : "What this instance still needs"}>
          <SetupChecklist items={checklist} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title={it ? "Workspace recenti" : "Recent workspaces"}
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link href="/admin/workspaces">
                {it ? "Vedi tutti" : "View all"} <ArrowRight />
              </Link>
            </Button>
          }
        >
          <RecentWorkspacesList workspaces={recentWorkspaces} />
        </Panel>
        <Panel
          title={it ? "Attività recente" : "Recent activity"}
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link href="/admin/audit">
                {it ? "Registro attività" : "Audit log"} <ArrowRight />
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
