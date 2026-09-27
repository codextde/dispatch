import Link from "next/link"
import type { Metadata } from "next"
import { CheckCircle2, CircleCheck, Cpu, Inbox, ListChecks, XCircle } from "lucide-react"
import { requireSuperAdminPage } from "@/server/authz"
import {
  JOB_STUCK_MS,
  getHealthChecks,
  getJobStats,
  getVersionInfo,
  getWorkerStatus,
  listFailedJobs,
  listInboxErrors,
} from "@/server/admin/system"
import {
  AdminPageHeader,
  DataTable,
  EmptyState,
  KeyValueList,
  MicroLabel,
  Panel,
  StatusBadge,
  Td,
  Th,
  formatNumber,
} from "@/components/admin/ui"
import { formatDateTime, isoOrUndefined, timeAgo } from "@/components/admin/format"
import { FailedJobsList, RecheckButton, RetryAllButton, type FailedJobView } from "@/components/admin/system/system-client"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "System" }

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m`
  return `${s}s`
}

const PROVIDER_LABEL: Record<string, string> = {
  imap: "IMAP",
  gmail: "Gmail",
  outlook: "Outlook",
  demo: "Demo",
}

function JobCounter({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "warn" | "error" }) {
  return (
    <div className="rounded-md border border-border bg-surface/50 px-3 py-2.5">
      <MicroLabel>{label}</MicroLabel>
      <div
        className={cn(
          "mt-1.5 text-xl font-semibold tracking-tight",
          tone === "warn" && value > 0 && "text-amber-600 dark:text-amber-400",
          tone === "error" && value > 0 && "text-destructive",
        )}
      >
        {formatNumber(value)}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

export default async function AdminSystemPage() {
  await requireSuperAdminPage()
  const [health, worker, jobs, failedJobs, inboxErrors] = await Promise.all([
    getHealthChecks(),
    getWorkerStatus(),
    getJobStats(),
    listFailedJobs(50),
    listInboxErrors(50),
  ])
  const version = getVersionInfo()
  const healthy = health.checks.every((c) => c.ok)

  const failedViews: FailedJobView[] = failedJobs.map((j) => ({
    id: j.id,
    type: j.type,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    lastError: j.lastError,
    payloadJson: JSON.stringify(j.payload, null, 2),
    created: formatDateTime(j.createdAt),
    createdAgo: timeAgo(j.createdAt),
    runAgo: timeAgo(j.runAt),
  }))

  return (
    <>
      <AdminPageHeader eyebrow="Operations" title="System" quiet="Health, jobs and sync errors." actions={<RecheckButton />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Health"
          description="Checked when this page loads"
          actions={
            <StatusBadge tone={healthy ? "ok" : "error"}>{healthy ? "All systems operational" : "Attention needed"}</StatusBadge>
          }
        >
          <ul className="-my-1 divide-y divide-border">
            {health.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 py-2.5">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="OK" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failing" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className={cn("mt-0.5 text-[13px] break-words", c.ok ? "text-muted-foreground" : "text-destructive")}>
                    {c.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Background worker"
          description="Syncs inboxes, sends scheduled mail and runs jobs"
          actions={
            worker.online ? (
              <StatusBadge tone="ok" pulse>
                Online
              </StatusBadge>
            ) : worker.reported ? (
              <StatusBadge tone="error">Offline</StatusBadge>
            ) : (
              <StatusBadge tone="warn">Not reported</StatusBadge>
            )
          }
        >
          {worker.reported ? (
            <>
              <KeyValueList
                items={[
                  {
                    label: "Last heartbeat",
                    value: worker.heartbeatAt ? (
                      <time dateTime={isoOrUndefined(worker.heartbeatAt)} title={formatDateTime(worker.heartbeatAt)}>
                        {timeAgo(worker.heartbeatAt)}
                      </time>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Uptime",
                    value:
                      worker.online && worker.startedAt && worker.uptimeSeconds !== null
                        ? `${formatDuration(worker.uptimeSeconds)} · since ${formatDateTime(worker.startedAt)}`
                        : worker.startedAt
                          ? `Last started ${formatDateTime(worker.startedAt)}`
                          : "—",
                  },
                  {
                    label: "Version",
                    value: worker.version ?? "—",
                    mono: true,
                  },
                  {
                    label: "Inboxes",
                    value:
                      worker.activeAccounts === null && worker.errorAccounts === null
                        ? "—"
                        : `${formatNumber(worker.activeAccounts ?? 0)} syncing · ${formatNumber(worker.errorAccounts ?? 0)} with errors`,
                  },
                ]}
              />
              {worker.lastError && (
                <div className="mt-4">
                  <MicroLabel className="mb-1.5">Last error</MicroLabel>
                  <pre className="scrollbar-thin max-h-40 overflow-auto rounded-md border border-destructive/25 bg-destructive/5 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-destructive">
                    {worker.lastError}
                  </pre>
                </div>
              )}
              {!worker.online && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  No heartbeat for more than 90 seconds. Check that the worker container is running:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
                    docker compose ps worker
                  </code>
                </p>
              )}
            </>
          ) : (
            <EmptyState
              icon={Cpu}
              title="The worker has not reported yet"
              description={
                <>
                  Inbox sync and scheduled sending need the worker process. Start it with{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
                    docker compose up -d worker
                  </code>{" "}
                  (or <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">pnpm dev:worker</code>{" "}
                  in development).
                </>
              }
              className="py-6"
            />
          )}
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Job queue"
        description="Background jobs processed by the worker"
        actions={failedJobs.length > 0 ? <RetryAllButton count={jobs.failed} /> : undefined}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
          <JobCounter
            label="Pending"
            value={jobs.pending}
            hint={
              jobs.retrying
                ? `${formatNumber(jobs.retrying)} retrying`
                : jobs.oldestPendingAt
                  ? `oldest ${timeAgo(jobs.oldestPendingAt)}`
                  : "Queue is clear"
            }
          />
          <JobCounter
            label="Due now"
            value={jobs.due}
            hint={jobs.backlogged ? "Waiting over 5 min" : "Ready to run"}
            tone={jobs.backlogged ? "warn" : undefined}
          />
          <JobCounter
            label="Running"
            value={jobs.running}
            hint={jobs.stuck ? `${formatNumber(jobs.stuck)} locked > ${JOB_STUCK_MS / 60_000} min` : "Locked by a worker"}
            tone={jobs.stuck ? "warn" : undefined}
          />
          <JobCounter label="Failed" value={jobs.failed} hint="Out of attempts" tone="error" />
          <JobCounter label="Completed · 24h" value={jobs.completed24h} hint="Excluding canceled" />
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">Failed jobs</h3>
            {jobs.failed > failedJobs.length && (
              <span className="text-xs text-muted-foreground">
                Showing the latest {failedJobs.length} of {formatNumber(jobs.failed)}
              </span>
            )}
          </div>
          {failedViews.length ? (
            <FailedJobsList jobs={failedViews} />
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" /> No failed jobs. Jobs that exhaust their
              retry attempts show up here.
            </p>
          )}
        </div>
      </Panel>

      <section id="inbox-errors" className="mt-6 scroll-mt-20">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Inboxes with sync errors{" "}
            {inboxErrors.total > 0 && (
              <span className="font-normal text-muted-foreground">· {formatNumber(inboxErrors.total)}</span>
            )}
          </h2>
          {inboxErrors.total > inboxErrors.rows.length && (
            <span className="text-xs text-muted-foreground">Showing the latest {inboxErrors.rows.length}</span>
          )}
        </div>
        {inboxErrors.rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState
              icon={Inbox}
              title="Every inbox is syncing"
              description="Connected inboxes that fail to sync across all workspaces show up here."
              className="py-8"
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
              {inboxErrors.rows.map((a) => (
                <li key={a.id} className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                    </div>
                    <StatusBadge tone="neutral" dot={false}>
                      {PROVIDER_LABEL[a.provider] ?? a.provider}
                    </StatusBadge>
                  </div>
                  <p className="text-[13px] break-words text-destructive">{a.lastError ?? "Unknown error"}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <Link href={`/admin/workspaces/${a.orgId}`} className="underline underline-offset-2">
                      {a.orgName}
                    </Link>
                    <span>Last synced {a.lastSyncedAt ? timeAgo(a.lastSyncedAt) : "never"}</span>
                  </div>
                </li>
              ))}
            </ul>
            <DataTable className="hidden md:block">
              <thead>
                <tr>
                  <Th>Inbox</Th>
                  <Th>Workspace</Th>
                  <Th>Provider</Th>
                  <Th>Last error</Th>
                  <Th>Last synced</Th>
                </tr>
              </thead>
              <tbody>
                {inboxErrors.rows.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/40">
                    <Td className="max-w-[220px]">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                    </Td>
                    <Td className="max-w-[180px]">
                      <Link href={`/admin/workspaces/${a.orgId}`} className="block truncate hover:underline">
                        {a.orgName}
                      </Link>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">/{a.orgSlug}</div>
                    </Td>
                    <Td>
                      <StatusBadge tone="neutral" dot={false}>
                        {PROVIDER_LABEL[a.provider] ?? a.provider}
                      </StatusBadge>
                    </Td>
                    <Td className="max-w-[340px]">
                      <p className="line-clamp-2 text-[13px] break-words text-destructive" title={a.lastError ?? undefined}>
                        {a.lastError ?? "Unknown error"}
                      </p>
                    </Td>
                    <Td className="text-[13px] whitespace-nowrap text-muted-foreground">
                      {a.lastSyncedAt ? (
                        <time dateTime={isoOrUndefined(a.lastSyncedAt)} title={formatDateTime(a.lastSyncedAt)}>
                          {timeAgo(a.lastSyncedAt)}
                        </time>
                      ) : (
                        "Never"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}
      </section>

      <Panel
        className="mt-6"
        title="Version"
        description="Build and runtime information"
        actions={<ListChecks className="size-4 text-muted-foreground" />}
      >
        <div className="grid gap-x-8 gap-y-2.5 lg:grid-cols-2">
          <KeyValueList
            items={[
              { label: "Dispatch", value: `v${version.version}`, mono: true },
              { label: "Node.js", value: version.node, mono: true },
              { label: "Next.js", value: version.next, mono: true },
              { label: "Environment", value: version.environment, mono: true },
              { label: "Platform", value: version.platform, mono: true },
            ]}
          />
          <KeyValueList
            className="border-t border-border pt-2.5 lg:border-t-0 lg:pt-0"
            items={[
              {
                label: "App process uptime",
                value: formatDuration(version.uptimeSeconds),
              },
              { label: "Public URL", value: version.appUrl, mono: true },
              { label: "Data directory", value: version.dataDir, mono: true },
              {
                label: "Migrations",
                value: health.migrations ? `${health.migrations.count} applied` : "Unknown",
              },
            ]}
          />
        </div>
      </Panel>
    </>
  )
}
