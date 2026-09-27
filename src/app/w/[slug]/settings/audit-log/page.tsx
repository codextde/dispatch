import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { auditFilterSchema, listAuditFacets, listAuditLogs } from "@/server/workspace/queries/audit"
import { SettingsPage } from "@/components/settings/settings-ui"
import { AuditLog } from "@/components/settings/audit/audit-log"

export const metadata: Metadata = { title: "Audit log" }

export default async function AuditLogPage({ params, searchParams }: PageProps<"/w/[slug]/settings/audit-log">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "audit.view")
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const filters = auditFilterSchema.parse({
    actor: one(sp.actor),
    action: one(sp.action),
    q: one(sp.q) || undefined,
    from: one(sp.from),
    to: one(sp.to),
    page: one(sp.page),
  })
  const [result, facets] = await Promise.all([listAuditLogs(ctx.org.id, filters), listAuditFacets(ctx.org.id)])

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Audit log"
      quiet="— who changed what, and when."
      description="Security-relevant events in this workspace: members, roles, inboxes, integrations, billing and settings."
      width="wide"
    >
      <AuditLog
        key={JSON.stringify(filters)}
        items={result.items}
        total={result.total}
        page={result.page}
        pages={result.pages}
        pageSize={result.pageSize}
        facets={facets}
        filters={{ actor: filters.actor, action: filters.action, q: filters.q, from: filters.from, to: filters.to }}
      />
    </SettingsPage>
  )
}
