import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/server/db"

/**
 * Instance-wide audit log queries for the super admin panel. Covers
 * instance-level events (`org_id is null`) and every workspace.
 */

export type AuditFilters = {
  /** A workspace id, or "instance" for instance-level events only */
  orgId?: string | null
  actorId?: string | null
  /** Matches the actor email (stored or current) — case-insensitive substring */
  actor?: string | null
  /** Action prefix, e.g. "admin." or "auth.login" */
  action?: string | null
  targetType?: string | null
  targetId?: string | null
  /** Inclusive dates, YYYY-MM-DD */
  from?: string | null
  to?: string | null
  page?: number
  pageSize?: number
}

export type AuditEvent = {
  id: string
  createdAt: Date
  orgId: string | null
  orgName: string | null
  orgSlug: string | null
  actorId: string | null
  actorEmail: string | null
  actorName: string | null
  actorAvatarUrl: string | null
  action: string
  targetType: string | null
  targetId: string | null
  /** Human label for user / organization targets when they still exist */
  targetLabel: string | null
  ip: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isUuid(v: string | null | undefined): v is string {
  return Boolean(v && UUID_RE.test(v))
}

export function isIsoDate(v: string | null | undefined): v is string {
  if (!v || !DATE_RE.test(v)) return false
  return !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
}

/** Escape LIKE wildcards in user input. */
function likeEscape(v: string) {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function buildWhere(f: AuditFilters): SQL {
  const conds: SQL[] = [sql`true`]
  if (f.orgId === "instance") conds.push(sql`a.org_id is null`)
  else if (isUuid(f.orgId)) conds.push(sql`a.org_id = ${f.orgId}`)
  if (isUuid(f.actorId)) conds.push(sql`a.actor_id = ${f.actorId}`)
  const actor = f.actor?.trim()
  if (actor) {
    const pattern = `%${likeEscape(actor.toLowerCase())}%`
    conds.push(sql`(lower(a.actor_email) like ${pattern} or lower(u.email) like ${pattern})`)
  }
  const action = f.action?.trim()
  if (action) conds.push(sql`starts_with(a.action, ${action})`)
  if (f.targetType) conds.push(sql`a.target_type = ${f.targetType}`)
  if (f.targetId) conds.push(sql`a.target_id = ${f.targetId}`)
  if (isIsoDate(f.from)) conds.push(sql`a.created_at >= ${f.from}::date`)
  if (isIsoDate(f.to)) conds.push(sql`a.created_at < (${f.to}::date + 1)`)
  return sql.join(conds, sql` and `)
}

type Row = {
  id: string
  created_at: string | Date
  org_id: string | null
  org_name: string | null
  org_slug: string | null
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  actor_avatar_url: string | null
  action: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
}

const FROM = sql`
  from audit_logs a
  left join users u on u.id = a.actor_id
  left join organizations o on o.id = a.org_id
`

/** Paginated audit events, newest first. */
export async function listAuditEvents(filters: AuditFilters = {}): Promise<{
  rows: AuditEvent[]
  total: number
  page: number
  pageSize: number
}> {
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50))
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const where = buildWhere(filters)

  const [rows, countRows] = await Promise.all([
    db.execute<Row>(sql`
      select
        a.id, a.created_at, a.org_id, o.name as org_name, o.slug as org_slug,
        a.actor_id, coalesce(a.actor_email, u.email) as actor_email, u.name as actor_name, u.avatar_url as actor_avatar_url,
        a.action, a.target_type, a.target_id,
        case
          when a.target_type = 'user' then (select tu.email from users tu where tu.id::text = a.target_id)
          when a.target_type in ('organization', 'workspace') then (select t_o.name from organizations t_o where t_o.id::text = a.target_id)
          else null
        end as target_label,
        a.ip, a.user_agent, a.metadata
      ${FROM}
      where ${where}
      order by a.created_at desc, a.id desc
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${FROM} where ${where}`),
  ])

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at),
      orgId: r.org_id,
      orgName: r.org_name,
      orgSlug: r.org_slug,
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      actorName: r.actor_name,
      actorAvatarUrl: r.actor_avatar_url,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      targetLabel: r.target_label,
      ip: r.ip,
      userAgent: r.user_agent,
      metadata: r.metadata ?? {},
    })),
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
  }
}

/** Options for the audit filters: workspaces and the actions seen so far. */
export async function getAuditFilterOptions() {
  const [orgs, actions] = await Promise.all([
    db.execute<{ id: string; name: string }>(sql`select id, name from organizations order by lower(name) limit 500`),
    db.execute<{ action: string }>(sql`
      select action from (select distinct action from audit_logs) s order by action limit 300
    `),
  ])
  const actionList = actions.map((a) => a.action)
  const prefixes = [...new Set(actionList.map((a) => `${a.split(".")[0]}.`))].sort()
  return {
    workspaces: orgs.map((o) => ({ id: o.id, name: o.name })),
    actions: actionList,
    prefixes,
  }
}
