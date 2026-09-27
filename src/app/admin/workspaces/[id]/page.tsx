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
          Open workspace <ArrowUpRight />
        </a>
      </Button>
    )
  } else if (owner && !owner.isSuperAdmin && owner.userStatus === "active") {
    openAction = (
      <PostButton action={`/admin/impersonate/${owner.userId}`} fields={{ next: inboxPath }} variant="default">
        Open as owner <ArrowUpRight />
      </PostButton>
    )
  }

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/workspaces", label: "Workspaces" }}
        eyebrow="Workspace"
        title={org.name}
        quiet={`/${org.slug}`}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={planTone(org.plan)} dot={false}>
              {planLabel(org.plan)}
            </StatusBadge>
            {org.suspendedAt ? (
              <StatusBadge tone="error">Suspended</StatusBadge>
            ) : (
              <StatusBadge tone={subscriptionTone(org.subscriptionStatus)}>{subscriptionLabel(org.subscriptionStatus)}</StatusBadge>
            )}
            <span className="text-muted-foreground">
              · created <LocalTime date={org.createdAt} format="relative" titleFormat="datetime" />
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
              Suspended <LocalTime date={org.suspendedAt} format="relative" titleFormat="datetime" /> — the workspace is read-only.
            </div>
            <div className="mt-0.5 break-words opacity-90">{org.suspendedReason || "No reason given."}</div>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Members" value={formatNumber(members.length)} hint={`${stats.pendingInvites} pending invites`} icon={Users} />
        <StatTile
          label="Inboxes"
          value={formatNumber(inboxes.length)}
          hint={inboxErrors ? `${inboxErrors} with errors` : "All healthy"}
          tone={inboxErrors ? "error" : "default"}
          icon={Inbox}
        />
        <StatTile
          label="Conversations"
          value={formatNumber(stats.conversations)}
          hint={`${formatNumber(stats.openConversations)} open`}
          icon={MessagesSquare}
        />
        <StatTile label="Messages" value={formatNumber(stats.messages)} hint={`${formatNumber(stats.messages30d)} in the last 30 days`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel title="Overview">
            <KeyValueList
              items={[
                { label: "Workspace ID", value: org.id, mono: true },
                { label: "URL", value: <span className="font-mono text-[13px]">{inboxPath}</span> },
                {
                  label: "Owner",
                  value: owner ? (
                    <Link href={`/admin/users/${owner.userId}`} className="underline-offset-2 hover:underline">
                      {owner.name ? `${owner.name} · ${owner.email}` : owner.email}
                    </Link>
                  ) : (
                    <span className="text-destructive">No owner</span>
                  ),
                },
                {
                  label: "Created",
                  value: (
                    <>
                      <LocalTime date={org.createdAt} />
                      {creator && (
                        <>
                          {" "}
                          by{" "}
                          <Link href={`/admin/users/${creator.id}`} className="underline-offset-2 hover:underline">
                            {creator.email}
                          </Link>
                        </>
                      )}
                    </>
                  ),
                },
                {
                  label: "Onboarding",
                  value: org.onboardingCompletedAt ? (
                    <>
                      Completed <LocalTime date={org.onboardingCompletedAt} format="date" />
                    </>
                  ) : (
                    "Not completed"
                  ),
                },
                {
                  label: "Last activity",
                  value: <LocalTime date={stats.lastActivityAt} format="relative" titleFormat="datetime" fallback="No activity yet" />,
                },
                { label: "Teams", value: formatNumber(stats.teams) },
                { label: "Time zone", value: org.settings?.timezone || "Instance default" },
              ]}
            />
          </Panel>

          <Panel title="Members" description={`${members.length} ${members.length === 1 ? "person" : "people"} with access`} bodyClassName="p-0">
            {members.length === 0 ? (
              <EmptyState icon={Users} title="No members" />
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
                              Super admin
                            </StatusBadge>
                          )}
                        </div>
                        <div className="truncate text-[12.5px] text-muted-foreground">
                          {m.name ? m.email : null}
                          {m.name ? " · " : null}
                          seen <LocalTime date={m.lastSeenAt} format="relative" titleFormat="datetime" fallback="never" />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                        {(m.status !== "active" || m.userStatus !== "active") && (
                          <StatusBadge tone="warn">{m.userStatus !== "active" ? "Disabled" : "Suspended"}</StatusBadge>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-[12.5px]">
                          <span className="size-2 rounded-full" style={{ backgroundColor: m.roleColor ?? "#64748b" }} aria-hidden />
                          {m.roleName}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Inboxes"
            description={inboxErrors ? `${inboxErrors} of ${inboxes.length} failing to sync` : `${inboxes.length} connected`}
            bodyClassName="p-0"
          >
            {inboxes.length === 0 ? (
              <EmptyState icon={Inbox} title="No inboxes connected" description="Members haven't connected an email account yet." />
            ) : (
              <ul className="divide-y divide-border">
                {inboxes.map((a) => (
                  <li key={a.id} className="px-4 py-3 md:px-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                            {PROVIDER_LABELS[a.provider] ?? a.provider} · {a.personal ? "Personal" : "Shared"}
                          </span>
                        </div>
                        <div className="truncate text-[12.5px] text-muted-foreground">{a.email}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge tone={accountStatusTone(a.status)} pulse={a.status === "syncing"}>
                          {a.status[0]!.toUpperCase() + a.status.slice(1)}
                        </StatusBadge>
                        <span className="text-[11.5px] text-muted-foreground">
                          synced <LocalTime date={a.lastSyncedAt} format="relative" titleFormat="datetime" fallback="never" />
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
          <Panel title="Subscription" description="Plan, billing status and trial">
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

          <Panel title="Access" description={org.suspendedAt ? "This workspace is suspended." : "Temporarily lock the workspace (read-only)."}>
            <SuspendControl id={org.id} name={org.name} suspended={Boolean(org.suspendedAt)} />
          </Panel>

          <Panel title="Ownership" description="Owners manage billing and can delete the workspace.">
            <TransferOwnershipControl id={org.id} candidates={transferCandidates} />
          </Panel>

          <section className="rounded-lg border border-destructive/30 bg-card">
            <header className="border-b border-destructive/20 px-4 py-3 md:px-5">
              <MicroLabel className="text-destructive">Danger zone</MicroLabel>
            </header>
            <div className="grid gap-3 p-4 md:p-5">
              <p className="text-[13px] text-muted-foreground">
                Deleting removes all data of <span className="font-medium text-foreground">{org.name}</span> permanently.
                {org.stripeSubscriptionId ? " Cancel the Stripe subscription separately." : ""}
              </p>
              <DeleteWorkspaceControl id={org.id} name={org.name} slug={org.slug} />
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
