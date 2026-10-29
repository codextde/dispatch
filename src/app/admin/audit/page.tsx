import type { Metadata } from "next"
import { ScrollText } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { getAuditFilterOptions, isIsoDate, isUuid, listAuditEvents, type AuditEvent } from "@/server/admin/audit"
import { AdminPageHeader, EmptyState, formatNumber } from "@/components/admin/ui"
import { Pager } from "@/components/admin/client"
import { AuditFilters } from "@/components/admin/audit/audit-filters"
import { AuditTable, type AuditRowView } from "@/components/admin/audit/audit-table"

export const metadata: Metadata = { title: "Audit log" }

const PAGE_SIZE = 50

/** Settings nav slugs differ from settings keys in one place. */
const SETTINGS_SLUG: Record<string, string> = { auth: "authentication" }

function targetHref(e: AuditEvent): string | null {
  if (!e.targetId) return null
  switch (e.targetType) {
    case "user":
      return isUuid(e.targetId) ? `/admin/users/${e.targetId}` : null
    case "organization":
    case "workspace":
      return isUuid(e.targetId) ? `/admin/workspaces/${e.targetId}` : null
    case "settings":
      return `/admin/settings/${SETTINGS_SLUG[e.targetId] ?? e.targetId}`
    case "job":
      return "/admin/system"
    case "account":
      return e.orgId ? `/admin/workspaces/${e.orgId}` : null
    default:
      return null
  }
}

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { user } = await requireSuperAdminPage()
  const it = user.locale === "it"
  const sp = await searchParams
  const filters = {
    orgId: one(sp.org) ?? null,
    actor: one(sp.actor)?.slice(0, 200) ?? null,
    action: one(sp.action)?.slice(0, 120) ?? null,
    from: isIsoDate(one(sp.from)) ? one(sp.from)! : null,
    to: isIsoDate(one(sp.to)) ? one(sp.to)! : null,
    actorId: one(sp.actorId) ?? null,
    targetType: one(sp.targetType)?.slice(0, 60) ?? null,
    targetId: one(sp.targetId)?.slice(0, 200) ?? null,
    page: Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1),
    pageSize: PAGE_SIZE,
  }

  const [events, options] = await Promise.all([listAuditEvents(filters), getAuditFilterOptions()])
  const filtered = Boolean(
    filters.orgId ||
    filters.actor ||
    filters.action ||
    filters.from ||
    filters.to ||
    filters.actorId ||
    filters.targetType ||
    filters.targetId,
  )

  const rows: AuditRowView[] = events.rows.map((e) => ({
    id: e.id,
    iso: e.createdAt.toISOString(),
    orgId: e.orgId,
    orgName: e.orgName,
    actorId: e.actorId,
    actorEmail: e.actorEmail,
    actorName: e.actorName,
    actorAvatarUrl: e.actorAvatarUrl,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    targetLabel: e.targetLabel,
    targetHref: targetHref(e),
    ip: e.ip,
    userAgent: e.userAgent,
    metadataJson: Object.keys(e.metadata).length ? JSON.stringify(e.metadata, null, 2) : null,
  }))

  return (
    <>
      <AdminPageHeader
        eyebrow={it ? "Operazioni" : "Operations"}
        title={it ? "Registro attività" : "Audit log"}
        quiet={it ? "Ogni accesso e azione amministrativa." : "Every sign-in and admin action."}
        description={it ? "Eventi dell’istanza e attività di tutti i workspace, dal più recente. I valori segreti non vengono mai registrati." : "Instance-level events and activity from every workspace, newest first. Secret values are never recorded."}
      />

      <AuditFilters workspaces={options.workspaces} suggestions={[...options.prefixes, ...options.actions]} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={ScrollText}
            title={filtered ? (it ? "Nessun evento corrisponde ai filtri" : "No events match these filters") : (it ? "Nessun evento registrato" : "No audit events yet")}
            description={
              filtered
                ? (it ? "Prova un intervallo di date più ampio o un prefisso azione più breve." : "Try a broader date range or a shorter action prefix.")
                : (it ? "Qui compariranno accessi, modifiche alle impostazioni e azioni amministrative." : "Sign-ins, settings changes and admin actions will appear here.")
            }
          />
        </div>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-muted-foreground" aria-live="polite">
            {formatNumber(events.total)} {it ? (events.total === 1 ? "evento" : "eventi") : (events.total === 1 ? "event" : "events")}
            {filtered ? (it ? " corrispondenti" : " match") : (it ? " registrati" : " recorded")}
          </p>
          <AuditTable rows={rows} />
          <Pager page={events.page} pageSize={events.pageSize} total={events.total} />
        </>
      )}
    </>
  )
}
