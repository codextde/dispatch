import type { Metadata } from "next"
import Link from "next/link"
import { Building2, ChevronRight } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { listWorkspaces } from "@/server/admin/workspaces"
import { AdminPageHeader, DataTable, EmptyState, StatusBadge, Td, Th, formatNumber } from "@/components/admin/ui"
import { FilterSelect, Pager, SearchParamInput } from "@/components/admin/client"
import { LocalTime } from "@/components/app/local-time"
import {
  PLAN_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  planLabel,
  planTone,
  subscriptionLabel,
  subscriptionTone,
} from "@/components/admin/workspaces/labels"
import { WorkspaceInitial } from "@/components/admin/workspaces/workspace-initial"

export const metadata: Metadata = { title: "Workspaces" }

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default async function AdminWorkspacesPage({ searchParams }: PageProps<"/admin/workspaces">) {
  const { user } = await requireSuperAdminPage()
  const it = user.locale === "it"
  const sp = await searchParams
  const q = first(sp.q) ?? ""
  const plan = first(sp.plan)
  const status = first(sp.status)
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1)
  const { rows, total, pageSize } = await listWorkspaces({ q, plan, status, page })
  const filtered = Boolean(q || plan || status)

  return (
    <>
      <AdminPageHeader
        eyebrow={it ? "Istanza" : "Instance"}
        title="Workspace"
        quiet={it ? "in questa istanza" : "on this instance"}
        description={it ? `${formatNumber(total)} workspace${filtered ? " corrispondenti ai filtri" : ""}. Gestisci piani, abbonamenti, sospensioni e proprietà.` : `${formatNumber(total)} ${total === 1 ? "workspace" : "workspaces"}${filtered ? " match your filters" : ""}. Manage plans, subscriptions, suspensions and ownership.`}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchParamInput placeholder={it ? "Cerca nome, slug o email del proprietario…" : "Search name, slug or owner email…"} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <FilterSelect param="plan" label={it ? "Piano" : "Plan"} options={PLAN_OPTIONS.map((p) => ({ value: p.value, label: it ? ({ Free: "Gratuito", Cloud: "Cloud", "Self-hosted": "Installato in autonomia", Comped: "Gratuito" }[p.label] ?? p.label) : p.label }))} />
          <FilterSelect
            param="status"
            label={it ? "Stato" : "Status"}
            options={[
              ...SUBSCRIPTION_STATUS_OPTIONS.filter((s) => s.value !== "incomplete").map((s) => ({ value: s.value, label: it ? (({ Active: "Attivo", Trial: "Prova", Trialing: "In prova", None: "Nessuno", "Past due": "Pagamento in ritardo", Canceled: "Annullato", Unpaid: "Non pagato", "No subscription": "Nessun abbonamento" } as Record<string, string>)[s.label] ?? s.label) : s.label })),
              { value: "suspended", label: it ? "Sospeso" : "Suspended" },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Building2}
            title={filtered ? (it ? "Nessun workspace corrispondente" : "No workspaces match") : (it ? "Nessun workspace" : "No workspaces yet")}
            description={
              filtered ? (it ? "Prova una ricerca diversa o rimuovi i filtri." : "Try a different search or clear the filters.") : (it ? "I workspace compariranno qui appena ne verrà creato uno." : "Workspaces appear here as soon as someone creates one.")
            }
          />
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/admin/workspaces/${w.id}`}
                  className="block rounded-lg border border-border bg-card p-3.5 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-3">
                    <WorkspaceInitial name={w.name} logoUrl={w.logoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{w.name}</div>
                      <div className="truncate font-mono text-[12px] text-muted-foreground">/{w.slug}</div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <StatusBadge tone={planTone(w.plan)} dot={false}>
                      {it ? ({ free: "Gratuito", cloud: "Cloud", self_hosted: "Installato in autonomia", comped: "Gratuito" }[w.plan] ?? planLabel(w.plan)) : planLabel(w.plan)}
                    </StatusBadge>
                    {w.suspendedAt ? (
                      <StatusBadge tone="error">{it ? "Sospeso" : "Suspended"}</StatusBadge>
                    ) : (
                      w.subscriptionStatus !== "none" && (
                        <StatusBadge tone={subscriptionTone(w.subscriptionStatus)}>{subscriptionLabel(w.subscriptionStatus)}</StatusBadge>
                      )
                    )}
                    {w.inboxErrors > 0 && <StatusBadge tone="error">{w.inboxErrors} {it ? "errori caselle" : "inbox errors"}</StatusBadge>}
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-[12px] text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground tabular-nums">{formatNumber(w.members)}</span> {it ? "membri" : "members"}
                    </span>
                    <span>
                      <span className="font-medium text-foreground tabular-nums">{formatNumber(w.inboxes)}</span> {it ? "caselle" : "inboxes"}
                    </span>
                    <span>
                      <span className="font-medium text-foreground tabular-nums">{formatNumber(w.conversations)}</span> {it ? "conversazioni" : "convos"}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-[12px] text-muted-foreground">
                    {w.ownerEmail ?? (it ? "Nessun proprietario" : "No owner")} · {it ? "creato" : "created"} <LocalTime date={w.createdAt} format="relative" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <DataTable className="hidden md:block">
            <thead>
              <tr>
                <Th>Workspace</Th>
                <Th>{it ? "Proprietario" : "Owner"}</Th>
                <Th className="text-right">{it ? "Membri" : "Members"}</Th>
                <Th className="text-right">{it ? "Caselle" : "Inboxes"}</Th>
                <Th className="text-right">{it ? "Conversazioni" : "Convos"}</Th>
                <Th>{it ? "Piano" : "Plan"}</Th>
                <Th>{it ? "Abbonamento" : "Subscription"}</Th>
                <Th>{it ? "Fine prova" : "Trial ends"}</Th>
                <Th>{it ? "Creato" : "Created"}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="group relative transition-colors hover:bg-surface/60">
                  <Td>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <WorkspaceInitial name={w.name} logoUrl={w.logoUrl} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/workspaces/${w.id}`}
                          className="block max-w-[220px] truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          {w.name}
                        </Link>
                        <div className="max-w-[220px] truncate font-mono text-[11.5px] text-muted-foreground">/{w.slug}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="max-w-[200px] truncate text-[13px] text-muted-foreground">{w.ownerEmail ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(w.members)}</Td>
                  <Td className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {w.inboxErrors > 0 && (
                        <StatusBadge tone="error" className="px-1.5">
                          {w.inboxErrors}
                        </StatusBadge>
                      )}
                      {formatNumber(w.inboxes)}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(w.conversations)}</Td>
                  <Td>
                    <StatusBadge tone={planTone(w.plan)} dot={false}>
                      {it ? ({ free: "Gratuito", cloud: "Cloud", self_hosted: "Installato in autonomia", comped: "Gratuito" }[w.plan] ?? planLabel(w.plan)) : planLabel(w.plan)}
                    </StatusBadge>
                  </Td>
                  <Td>
                    {w.suspendedAt ? (
                      <StatusBadge tone="error">{it ? "Sospeso" : "Suspended"}</StatusBadge>
                    ) : (
                      <StatusBadge tone={subscriptionTone(w.subscriptionStatus)}>{subscriptionLabel(w.subscriptionStatus)}</StatusBadge>
                    )}
                  </Td>
                  <Td className="text-[13px] whitespace-nowrap text-muted-foreground">
                    {w.trialEndsAt ? (
                      <span className={w.trialEndsAt < new Date() ? "text-amber-700 dark:text-amber-400" : undefined}>
                        <LocalTime date={w.trialEndsAt} format="date" />
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-[13px] whitespace-nowrap text-muted-foreground">
                    <LocalTime date={w.createdAt} format="date" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      {total > pageSize && <Pager page={page} pageSize={pageSize} total={total} />}
    </>
  )
}
