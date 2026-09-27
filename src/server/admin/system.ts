import "server-only"
import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getAppUrl, getDataDir } from "@/server/env"
import { checkDataDir, checkDatabase } from "@/server/setup"
import { testStorage } from "@/server/storage"
import { getSettings } from "@/server/settings"
import pkg from "../../../package.json"
import nextPkg from "next/package.json"

/**
 * Instance health for Admin → System: database, migrations, storage, worker
 * heartbeat, background jobs and failing inboxes.
 */

/** A worker heartbeat older than this is considered offline. */
export const WORKER_STALE_MS = 90_000
/** A job locked for longer than this is probably orphaned by a crashed worker. */
export const JOB_STUCK_MS = 15 * 60_000

export type WorkerStatus = {
  reported: boolean
  online: boolean
  heartbeatAt: Date | null
  startedAt: Date | null
  /** Seconds since the worker started (null when unknown) */
  uptimeSeconds: number | null
  version: string | null
  activeAccounts: number | null
  errorAccounts: number | null
  lastError: string | null
}

function asDate(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Worker heartbeat, written by the worker into instance_settings["worker_status"]. */
export async function getWorkerStatus(): Promise<WorkerStatus> {
  let value: Record<string, unknown> | null = null
  try {
    const row = await db.query.instanceSettings.findFirst({
      where: eq(schema.instanceSettings.key, "worker_status"),
    })
    value = row?.value && typeof row.value === "object" ? (row.value as Record<string, unknown>) : null
  } catch {
    value = null
  }
  const heartbeatAt = asDate(value?.heartbeatAt)
  const startedAt = asDate(value?.startedAt)
  return {
    reported: Boolean(value),
    online: Boolean(heartbeatAt && Date.now() - heartbeatAt.getTime() < WORKER_STALE_MS),
    heartbeatAt,
    startedAt,
    uptimeSeconds: startedAt ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)) : null,
    version: typeof value?.version === "string" ? value.version : null,
    activeAccounts: asNumber(value?.activeAccounts),
    errorAccounts: asNumber(value?.errorAccounts),
    lastError: typeof value?.lastError === "string" && value.lastError ? value.lastError : null,
  }
}

export async function getMigrationInfo(): Promise<{
  count: number
  lastAppliedAt: Date | null
} | null> {
  try {
    const rows = await db.execute<{
      count: number
      last: string | number | null
    }>(sql`select count(*)::int as count, max(created_at) as last from drizzle.__drizzle_migrations`)
    const row = rows[0]
    if (!row) return null
    return {
      count: Number(row.count),
      lastAppliedAt: row.last ? new Date(Number(row.last)) : null,
    }
  } catch {
    return null
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export type HealthCheck = {
  key: string
  label: string
  ok: boolean
  detail: string
}

export async function getHealthChecks() {
  const [database, dataDir, migrations, storageSettings, storage] = await Promise.all([
    checkDatabase(),
    checkDataDir(),
    getMigrationInfo(),
    getSettings("storage"),
    withTimeout(testStorage(), 8_000, {
      ok: false,
      error: "Timed out after 8s",
    }),
  ])
  const storageTarget =
    storageSettings.driver === "s3" && storageSettings.s3Bucket
      ? `S3 bucket “${storageSettings.s3Bucket}”${storageSettings.s3Endpoint ? ` at ${storageSettings.s3Endpoint}` : ""}`
      : "Local disk"
  const checks: HealthCheck[] = [
    {
      key: "database",
      label: "Database",
      ok: database.ok,
      detail: database.detail,
    },
    {
      key: "migrations",
      label: "Migrations",
      ok: Boolean(migrations && migrations.count > 0),
      detail: migrations
        ? `${migrations.count} applied${migrations.lastAppliedAt ? ` · latest ${migrations.lastAppliedAt.toISOString().slice(0, 10)}` : ""}`
        : "Migration table not accessible",
    },
    {
      key: "data_dir",
      label: "Data directory",
      ok: dataDir.ok,
      detail: dataDir.detail,
    },
    {
      key: "storage",
      label: "Attachment storage",
      ok: storage.ok,
      detail: storage.ok ? `${storageTarget} · write, read & delete OK` : `${storageTarget} · ${storage.error ?? "failed"}`,
    },
  ]
  return { checks, databaseLatencyMs: database.latencyMs, migrations }
}

/* ---------------------------------- Jobs ---------------------------------- */

/**
 * Job states (the `jobs` table has no explicit status column):
 *  - pending:   not completed, not locked, attempts left (includes retrying jobs)
 *  - retrying:  pending jobs whose last attempt failed
 *  - running:   locked by a worker and not completed (stuck: locked > 15 min)
 *  - failed:    not completed and out of attempts — the worker won't pick it up again
 *  - completed: completed_at set (canceled jobs carry last_error = 'canceled')
 */
export type JobStats = {
  pending: number
  due: number
  retrying: number
  running: number
  stuck: number
  failed: number
  completed24h: number
  oldestPendingAt: Date | null
  /** Due jobs have been waiting for more than 5 minutes */
  backlogged: boolean
}

export async function getJobStats(): Promise<JobStats> {
  const rows = await db.execute<{
    pending: number
    due: number
    retrying: number
    running: number
    stuck: number
    failed: number
    completed_24h: number
    oldest_pending: string | Date | null
  }>(sql`
    select
      count(*) filter (where completed_at is null and locked_at is null and attempts < max_attempts)::int as pending,
      count(*) filter (where completed_at is null and locked_at is null and attempts < max_attempts and run_at <= now())::int as due,
      count(*) filter (where completed_at is null and locked_at is null and attempts < max_attempts and last_error is not null)::int as retrying,
      count(*) filter (where completed_at is null and locked_at is not null and attempts < max_attempts)::int as running,
      count(*) filter (where completed_at is null and locked_at < now() - make_interval(secs => ${JOB_STUCK_MS / 1000}) and attempts < max_attempts)::int as stuck,
      count(*) filter (where completed_at is null and attempts >= max_attempts)::int as failed,
      count(*) filter (where completed_at > now() - interval '24 hours' and last_error is distinct from 'canceled')::int as completed_24h,
      min(run_at) filter (where completed_at is null and locked_at is null and attempts < max_attempts and run_at <= now()) as oldest_pending
    from jobs
  `)
  const r = rows[0]
  return {
    pending: Number(r?.pending ?? 0),
    due: Number(r?.due ?? 0),
    retrying: Number(r?.retrying ?? 0),
    running: Number(r?.running ?? 0),
    stuck: Number(r?.stuck ?? 0),
    failed: Number(r?.failed ?? 0),
    completed24h: Number(r?.completed_24h ?? 0),
    oldestPendingAt: r?.oldest_pending ? new Date(r.oldest_pending) : null,
    backlogged: Boolean(r?.oldest_pending && Date.now() - new Date(r.oldest_pending).getTime() > 5 * 60_000),
  }
}

export type FailedJob = {
  id: string
  type: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  payload: Record<string, unknown>
  createdAt: Date
  runAt: Date
}

export async function listFailedJobs(limit = 50): Promise<FailedJob[]> {
  const rows = await db.execute<{
    id: string
    type: string
    attempts: number
    max_attempts: number
    last_error: string | null
    payload: Record<string, unknown> | null
    created_at: string | Date
    run_at: string | Date
  }>(sql`
    select id, type, attempts, max_attempts, last_error, payload, created_at, run_at
    from jobs
    where completed_at is null and attempts >= max_attempts
    order by created_at desc
    limit ${limit}
  `)
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    lastError: r.last_error,
    payload: r.payload ?? {},
    createdAt: new Date(r.created_at),
    runAt: new Date(r.run_at),
  }))
}

/** Reset failed jobs so the worker picks them up again. Returns the retried job types. */
export async function retryJobs(ids: string[] | "all_failed") {
  const where =
    ids === "all_failed"
      ? sql`completed_at is null and attempts >= max_attempts`
      : sql`id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}) and completed_at is null`
  if (ids !== "all_failed" && ids.length === 0) return []
  const rows = await db.execute<{ id: string; type: string }>(sql`
    update jobs set attempts = 0, run_at = now(), last_error = null, locked_at = null
    where ${where}
    returning id, type
  `)
  for (const type of new Set(rows.map((r) => r.type))) {
    await db.execute(sql`select pg_notify('dispatch_jobs', ${type})`).catch(() => {})
  }
  return rows.map((r) => ({ id: r.id, type: r.type }))
}

export async function deleteJob(id: string) {
  const rows = await db.execute<{ id: string; type: string }>(sql`
    delete from jobs where id = ${id}::uuid and completed_at is null returning id, type
  `)
  return rows[0] ?? null
}

/* --------------------------------- Inboxes -------------------------------- */

export type InboxError = {
  id: string
  name: string
  email: string
  provider: string
  lastError: string | null
  lastSyncedAt: Date | null
  updatedAt: Date
  orgId: string
  orgName: string
  orgSlug: string
}

export async function listInboxErrors(limit = 50): Promise<{ rows: InboxError[]; total: number }> {
  const [rows, count] = await Promise.all([
    db.execute<{
      id: string
      name: string
      email: string
      provider: string
      last_error: string | null
      last_synced_at: string | Date | null
      updated_at: string | Date
      org_id: string
      org_name: string
      org_slug: string
    }>(sql`
      select a.id, a.name, a.email, a.provider, a.last_error, a.last_synced_at, a.updated_at,
             o.id as org_id, o.name as org_name, o.slug as org_slug
      from accounts a
      join organizations o on o.id = a.org_id
      where a.status = 'error'
      order by a.updated_at desc
      limit ${limit}
    `),
    db.execute<{ total: number }>(sql`select count(*)::int as total from accounts where status = 'error'`),
  ])
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      provider: r.provider,
      lastError: r.last_error,
      lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at) : null,
      updatedAt: new Date(r.updated_at),
      orgId: r.org_id,
      orgName: r.org_name,
      orgSlug: r.org_slug,
    })),
    total: Number(count[0]?.total ?? 0),
  }
}

/* --------------------------------- Version -------------------------------- */

export function getVersionInfo() {
  let dataDir = ""
  try {
    dataDir = getDataDir()
  } catch {
    dataDir = process.env.DATA_DIR || "unavailable"
  }
  return {
    version: (pkg as { version?: string }).version ?? "0.0.0",
    node: process.version,
    next: (nextPkg as { version?: string }).version ?? "unknown",
    appUrl: getAppUrl(),
    dataDir,
    environment: process.env.NODE_ENV ?? "development",
    platform: `${process.platform}/${process.arch}`,
    uptimeSeconds: Math.round(process.uptime()),
  }
}
