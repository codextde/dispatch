import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowUpRight, Inbox, MessagesSquare, Users } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import { getWorkspaceDetail } from "@/server/admin/workspaces"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import {
  AdminPageHeader,
  EmptyState,
  KeyValueList,
  MicroLabel,
  Panel,
  StatTile,
  StatusBadge,
  formatNumber,
} from "@/components/admin/ui"
import { PostButton } from "@/components/admin/client"
import { LocalTime } from "@/components/app/local-time"
import {
  PROVIDER_LABELS,
  accountStatusTone,
  planLabel,
  planTone,
  subscriptionLabel,
  subscriptionTone,
} from "@/components/admin/workspaces/labels"
import { WorkspaceInitial } from "@/components/admin/workspaces/workspace-initial"
import { localizeRoleName } from "@/lib/i18n"
import {
  DeleteWorkspaceControl,
  SubscriptionControls,
  SuspendControl,
  TransferOwnershipControl,
} from "@/components/admin/workspaces/workspace-controls"

export async function generateMetadata({ params }: PageProps<"/admin/workspaces/[id]">): Promise<Metadata> {
  await requireSuperAdminPage()
  const { id } = await params
  const detail = await getWorkspaceDetail(id)
  return { title: detail ? `${detail.org.name} · Workspaces` : "Workspace" }
}

export default async function AdminWorkspaceDetailPage({ params }: PageProps<"/admin/workspaces/[id]">) {
  const { user: me } = await requireSuperAdminPage()
  const it = me.locale === "it"
  const { id } = await params
  const detail = await getWorkspaceDetail(id)
  if (!detail) notFound()
  const { org, creator, stats, members, inboxes, owners, stripeCustomerUrl } = detail

  const isMember = members.some((m) => m.userId === me.id && m.status === "active")
  const owner = owners.find((o) => o.status === "active" && o.userStatus === "active") ?? owners[0]
  const inboxErrors = inboxes.filter((i) => i.status === "error").length
  const trialExpired = Boolean(org.trialEndsAt && org.trialEndsAt < new Date())
  const transferCandidates = members
    .filter((m) => m.roleKey !== "owner" && m.status === "active" && m.userStatus === "active")
    .map((m) => ({ userId: m.userId, label: m.name ? `${m.name} (${m.email})` : m.email, role: m.roleName }))
  const inboxPath = `/w/${org.slug}/inbox`

  let openAction: React.ReactNode = null
  if (isMember) {
    openAction = (
      <Button asChild size="sm">
        <a href={inboxPath}>
          {it ? "Apri workspace" : "Open workspace"} <ArrowUpRight />
        </a>
      </Button>
    )
  } else if (owner && !owner.isSuperAdmin && owner.userStatus === "active") {
    openAction = (
      <PostButton action={`/admin/impersonate/${owner.userId}`} fields={{ next: inboxPath }} variant="default">
        {it ? "Apri come proprietario" : "Open as owner"} <ArrowUpRight />
      </PostButton>
    )
  }

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/workspaces", label: "Workspace" }}
        eyebrow="Workspace"
        title={org.name}
        quiet={`/${org.slug}`}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={planTone(org.plan)} dot={false}>
              {it ? ({ free: "Gratuito", cloud: "Cloud", self_hosted: "Installato in autonomia", comped: "Gratuito" }[org.plan] ?? planLabel(org.plan)) : planLabel(org.plan)}
            </StatusBadge>
            {org.suspendedAt ? (
              <StatusBadge tone="error">{it ? "Sospeso" : "Suspended"}</StatusBadge>
            ) : (
              <StatusBadge tone={subscriptionTone(org.subscriptionStatus)}>{subscriptionLabel(org.subscriptionStatus)}</StatusBadge>
            )}
            <span className="text-muted-foreground">
              · {it ? "creato" : "created"} <LocalTime date={org.createdAt} format="relative" titleFormat="datetime" />
            </span>
          </span>
        }
        actions={
          <>
            <WorkspaceInitial name={org.name} logoUrl={org.logoUrl} size="lg" className="hidden sm:flex" />
            {openAction}
          </>
        }
      />

      {org.suspendedAt && (
        <div
          role="status"
          className="mb-6 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">
              {it ? "Sospeso" : "Suspended"} <LocalTime date={org.suspendedAt} format="relative" titleFormat="datetime" /> — {it ? "il workspace è in sola lettura." : "the workspace is read-only."}
            </div>
            <div className="mt-0.5 break-words opacity-90">{org.suspendedReason || (it ? "Nessun motivo indicato." : "No reason given.")}</div>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={it ? "Membri" : "Members"} value={formatNumber(members.length)} hint={`${stats.pendingInvites} ${it ? "inviti in attesa" : "pending invites"}`} icon={Users} />
        <StatTile
          label={it ? "Caselle" : "Inboxes"}
          value={formatNumber(inboxes.length)}
          hint={inboxErrors ? `${inboxErrors} ${it ? "con errori" : "with errors"}` : (it ? "Tutte operative" : "All healthy")}
          tone={inboxErrors ? "error" : "default"}
          icon={Inbox}
        />
        <StatTile
          label={it ? "Conversazioni" : "Conversations"}
          value={formatNumber(stats.conversations)}
          hint={`${formatNumber(stats.openConversations)} ${it ? "aperte" : "open"}`}
          icon={MessagesSquare}
        />
        <StatTile label={it ? "Messaggi" : "Messages"} value={formatNumber(stats.messages)} hint={`${formatNumber(stats.messages30d)} ${it ? "negli ultimi 30 giorni" : "in the last 30 days"}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel title={it ? "Panoramica" : "Overview"}>
            <KeyValueList
              items={[
                { label: it ? "ID workspace" : "Workspace ID", value: org.id, mono: true },
                { label: "URL", value: <span className="font-mono text-[13px]">{inboxPath}</span> },
                {
                  label: it ? "Proprietario" : "Owner",
                  value: owner ? (
                    <Link href={`/admin/users/${owner.userId}`} className="underline-offset-2 hover:underline">
                      {owner.name ? `${owner.name} · ${owner.email}` : owner.email}
                    </Link>
                  ) : (
                    <span className="text-destructive">{it ? "Nessun proprietario" : "No owner"}</span>
                  ),
                },
                {
                  label: it ? "Creato" : "Created",
                  value: (
                    <>
                      <LocalTime date={org.createdAt} />
                      {creator && (
                        <>
                          {" "}
                          {it ? "da" : "by"}{" "}
                          <Link href={`/admin/users/${creator.id}`} className="underline-offset-2 hover:underline">
                            {creator.email}
                          </Link>
                        </>
                      )}
                    </>
                  ),
                },
                {
                  label: it ? "Configurazione iniziale" : "Onboarding",
                  value: org.onboardingCompletedAt ? (
                    <>
                      {it ? "Completato" : "Completed"} <LocalTime date={org.onboardingCompletedAt} format="date" />
                    </>
                  ) : (
                    it ? "Non completato" : "Not completed"
                  ),
                },
                {
                  label: it ? "Ultima attività" : "Last activity",
                  value: <LocalTime date={stats.lastActivityAt} format="relative" titleFormat="datetime" fallback={it ? "Nessuna attività" : "No activity yet"} />,
                },
                { label: it ? "Team" : "Teams", value: formatNumber(stats.teams) },
                { label: it ? "Fuso orario" : "Time zone", value: org.settings?.timezone || (it ? "Predefinito istanza" : "Instance default") },
              ]}
            />
          </Panel>

          <Panel title={it ? "Membri" : "Members"} description={it ? `${members.length} ${members.length === 1 ? "persona con accesso" : "persone con accesso"}` : `${members.length} ${members.length === 1 ? "person" : "people"} with access`} bodyClassName="p-0">
            {members.length === 0 ? (
              <EmptyState icon={Users} title={it ? "Nessun membro" : "No members"} />
            ) : (
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.membershipId}>
                    <Link
                      href={`/admin/users/${m.userId}`}
                      className="flex items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-surface/60 focus-visible:bg-surface md:px-5"
                    >
                      <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{m.name || m.email}</span>
                          {m.isSuperAdmin && (
                            <StatusBadge tone="brand" dot={false} className="h-4 px-1.5 text-[10px]">
                              {it ? "Super amministratore" : "Super admin"}
                            </StatusBadge>
                          )}
                        </div>
                        <div className="truncate text-[12.5px] text-muted-foreground">
                          {m.name ? m.email : null}
                          {m.name ? " · " : null}
                          {it ? "visto" : "seen"} <LocalTime date={m.lastSeenAt} format="relative" titleFormat="datetime" fallback={it ? "mai" : "never"} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                        {(m.status !== "active" || m.userStatus !== "active") && (
                          <StatusBadge tone="warn">{m.userStatus !== "active" ? (it ? "Disattivato" : "Disabled") : (it ? "Sospeso" : "Suspended")}</StatusBadge>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-[12.5px]">
                          <span className="size-2 rounded-full" style={{ backgroundColor: m.roleColor ?? "#64748b" }} aria-hidden />
                          {localizeRoleName(m.roleKey, m.roleName, it ? "it" : "en")}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={it ? "Caselle" : "Inboxes"}
            description={inboxErrors ? (it ? `${inboxErrors} su ${inboxes.length} non si sincronizzano` : `${inboxErrors} of ${inboxes.length} failing to sync`) : `${inboxes.length} ${it ? "connesse" : "connected"}`}
            bodyClassName="p-0"
          >
            {inboxes.length === 0 ? (
              <EmptyState icon={Inbox} title={it ? "Nessuna casella collegata" : "No inboxes connected"} description={it ? "I membri non hanno ancora collegato un account email." : "Members haven't connected an email account yet."} />
            ) : (
              <ul className="divide-y divide-border">
                {inboxes.map((a) => (
                  <li key={a.id} className="px-4 py-3 md:px-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                            {PROVIDER_LABELS[a.provider] ?? a.provider} · {a.personal ? (it ? "Personale" : "Personal") : (it ? "Condivisa" : "Shared")}
                          </span>
                        </div>
                        <div className="truncate text-[12.5px] text-muted-foreground">{a.email}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge tone={accountStatusTone(a.status)} pulse={a.status === "syncing"}>
                          {it ? (({ connected: "Connessa", syncing: "In sincronizzazione", error: "Errore", paused: "In pausa", active: "Attiva", pending: "In attesa" } as Record<string, string>)[a.status] ?? a.status) : a.status[0]!.toUpperCase() + a.status.slice(1)}
                        </StatusBadge>
                        <span className="text-[11.5px] text-muted-foreground">
                          {it ? "sincronizzata" : "synced"} <LocalTime date={a.lastSyncedAt} format="relative" titleFormat="datetime" fallback={it ? "mai" : "never"} />
                        </span>
                      </div>
                    </div>
                    {a.lastError && (
                      <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 font-mono text-[12px] break-words text-destructive">
                        {a.lastError}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Panel title={it ? "Abbonamento" : "Subscription"} description={it ? "Piano, stato della fatturazione e periodo di prova" : "Plan, billing status and trial"}>
            <SubscriptionControls
              id={org.id}
              plan={org.plan}
              status={org.subscriptionStatus}
              trialEndsAt={org.trialEndsAt?.toISOString() ?? null}
              trialExpired={trialExpired}
              stripeCustomerId={org.stripeCustomerId}
              stripeCustomerUrl={stripeCustomerUrl}
              stripeSubscriptionId={org.stripeSubscriptionId}
              currentPeriodEndsAt={org.currentPeriodEndsAt?.toISOString() ?? null}
            />
          </Panel>

          <Panel title={it ? "Accesso" : "Access"} description={org.suspendedAt ? (it ? "Questo workspace è sospeso." : "This workspace is suspended.") : (it ? "Blocca temporaneamente il workspace (sola lettura)." : "Temporarily lock the workspace (read-only).")}>
            <SuspendControl id={org.id} name={org.name} suspended={Boolean(org.suspendedAt)} />
          </Panel>

          <Panel title={it ? "Proprietà" : "Ownership"} description={it ? "I proprietari gestiscono la fatturazione e possono eliminare il workspace." : "Owners manage billing and can delete the workspace."}>
            <TransferOwnershipControl id={org.id} candidates={transferCandidates} />
          </Panel>

          <section className="rounded-lg border border-destructive/30 bg-card">
            <header className="border-b border-destructive/20 px-4 py-3 md:px-5">
              <MicroLabel className="text-destructive">{it ? "Zona pericolosa" : "Danger zone"}</MicroLabel>
            </header>
            <div className="grid gap-3 p-4 md:p-5">
              <p className="text-[13px] text-muted-foreground">
                {it ? "L’eliminazione rimuoverà definitivamente tutti i dati di " : "Deleting removes all data of "}<span className="font-medium text-foreground">{org.name}</span>{it ? " in modo permanente." : " permanently."}
                {org.stripeSubscriptionId ? (it ? " Annulla separatamente l’abbonamento Stripe." : " Cancel the Stripe subscription separately.") : ""}
              </p>
              <DeleteWorkspaceControl id={org.id} name={org.name} slug={org.slug} />
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
