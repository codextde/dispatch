import "server-only"
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getSettings } from "@/server/settings"

/**
 * Workspace analytics (Analytics page). Everything is aggregated in Postgres.
 *
 * Scope: conversations of SHARED inboxes (accounts.owner_user_id IS NULL) of
 * one workspace, kind "email", excluding spam, trash and merged threads.
 * Day buckets and hour-of-week use the workspace timezone.
 *
 * Filters:
 *  - accountId / teamId restrict the conversation scope
 *  - userId restricts conversation metrics to conversations assigned to that
 *    teammate, and "replies sent" to replies written by that teammate
 */

export type AnalyticsRange = {
  /** Inclusive local start date (YYYY-MM-DD) */
  from: string
  /** Exclusive local end date (YYYY-MM-DD) */
  to: string
  /** Previous period of equal length, for deltas */
  prevFrom: string
  prevTo: string
  days: number
  granularity: "day" | "week"
  tz: string
}

export type AnalyticsFilters = {
  accountId?: string
  teamId?: string
  userId?: string
}

type Q = { orgId: string; range: AnalyticsRange; filters: AnalyticsFilters }

/* --------------------------------- Range --------------------------------- */

function isValidTimezone(tz: string | undefined | null): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function resolveTimezone(orgTimezone: string | undefined | null): Promise<string> {
  if (isValidTimezone(orgTimezone)) return orgTimezone
  const general = await getSettings("general")
  return isValidTimezone(general.defaultTimezone) ? general.defaultTimezone : "UTC"
}

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

const DAY_MS = 86_400_000
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!) + n * DAY_MS).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  const pa = a.split("-").map(Number)
  const pb = b.split("-").map(Number)
  return Math.round((Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!) - Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)) / DAY_MS)
}

export function isYmd(v: string | undefined | null): v is string {
  if (!v || !YMD_RE.test(v)) return false
  const [y, m, d] = v.split("-").map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
}

export const MAX_RANGE_DAYS = 366

/**
 * Build the reporting window. Presets end today (inclusive); a custom range
 * uses inclusive local dates, clamped to today and MAX_RANGE_DAYS.
 */
export function buildRange(
  tz: string,
  opts: { preset: 7 | 30 | 90 } | { from: string; to: string }
): AnalyticsRange {
  const today = todayIn(tz)
  let from: string
  let to: string
  if ("preset" in opts) {
    to = addDays(today, 1)
    from = addDays(to, -opts.preset)
  } else {
    let a = opts.from
    let b = opts.to
    if (diffDays(a, b) < 0) [a, b] = [b, a]
    if (diffDays(today, b) > 0) b = today
    if (diffDays(a, b) < 0) a = b
    to = addDays(b, 1)
    from = diffDays(a, to) > MAX_RANGE_DAYS ? addDays(to, -MAX_RANGE_DAYS) : a
  }
  const days = diffDays(from, to)
  return {
    from,
    to,
    prevFrom: addDays(from, -days),
    prevTo: from,
    days,
    granularity: days > 62 ? "week" : "day",
    tz,
  }
}

/* ------------------------------ SQL helpers ------------------------------ */

/** Local midnight of a YYYY-MM-DD date in the range timezone, as timestamptz. */
function at(date: string, tz: string): SQL {
  return sql`((${date}::date)::timestamp at time zone ${tz}::text)`
}

function between(col: SQL, from: string, to: string, tz: string): SQL {
  return sql`(${col} >= ${at(from, tz)} and ${col} < ${at(to, tz)})`
}

/**
 * Conversations in scope. `assignee` applies the teammate filter (conversation
 * metrics); replies use the base scope and filter by author instead.
 */
function scope({ orgId, filters, range }: Q, opts: { assignee: boolean }): SQL {
  // Only conversations that can contribute to the current or previous period
  // (plus everything still open, for the "currently open" count).
  const lower = at(range.prevFrom, range.tz)
  return sql`
    select
      c.id, c.account_id, c.team_id, c.status, c.created_at, c.closed_at, c.closed_by,
      c.snoozed_until, c.last_message_at,
      exists (select 1 from messages mi where mi.conversation_id = c.id and mi.direction = 'inbound') as has_inbound,
      coalesce(
        c.first_response_at,
        (select min(coalesce(mo.sent_at, mo.created_at)) from messages mo
          where mo.conversation_id = c.id and mo.direction = 'outbound' and mo.status = 'sent' and mo.author_id is not null)
      ) as responded_at
    from conversations c
    inner join accounts a on a.id = c.account_id
    where c.org_id = ${orgId}
      and a.org_id = ${orgId}
      and a.owner_user_id is null
      and c.kind = 'email'
      and c.is_spam = false
      and c.is_trash = false
      and c.merged_into_id is null
      and (c.status = 'open' or c.created_at >= ${lower} or c.closed_at >= ${lower} or c.last_activity_at >= ${lower})
      ${filters.accountId ? sql`and c.account_id = ${filters.accountId}` : sql``}
      ${filters.teamId ? sql`and c.team_id = ${filters.teamId}` : sql``}
      ${
        opts.assignee && filters.userId
          ? sql`and exists (select 1 from conversation_assignees ca where ca.conversation_id = c.id and ca.user_id = ${filters.userId})`
          : sql``
      }`
}

/** Seconds from conversation start to first reply (null when not answered or inconsistent). */
const FRT = sql`case when s.has_inbound and s.responded_at >= s.created_at then extract(epoch from (s.responded_at - s.created_at)) end`
const RESOLUTION = sql`case when s.closed_at >= s.created_at then extract(epoch from (s.closed_at - s.created_at)) end`

/** Outbound replies in the base scope (author filter when a teammate is selected). */
function repliesWhere(q: Q): SQL {
  return sql`m.direction = 'outbound' and m.status = 'sent' and m.author_id is not null
    ${q.filters.userId ? sql`and m.author_id = ${q.filters.userId}` : sql``}`
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/* -------------------------------- Options -------------------------------- */

export type AnalyticsOptions = {
  accounts: { id: string; name: string; email: string; color: string }[]
  teams: { id: string; name: string; color: string }[]
  members: { id: string; name: string | null; email: string; avatarUrl: string | null }[]
}

export async function getAnalyticsOptions(orgId: string): Promise<AnalyticsOptions> {
  const [accounts, teams, members] = await Promise.all([
    db
      .select({ id: schema.accounts.id, name: schema.accounts.name, email: schema.accounts.email, color: schema.accounts.color })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.orgId, orgId), isNull(schema.accounts.ownerUserId)))
      .orderBy(asc(schema.accounts.name)),
    db
      .select({ id: schema.teams.id, name: schema.teams.name, color: schema.teams.color })
      .from(schema.teams)
      .where(eq(schema.teams.orgId, orgId))
      .orderBy(asc(schema.teams.name)),
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatarUrl: schema.users.avatarUrl })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, orgId))
      .orderBy(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`),
  ])
  return { accounts, teams, members }
}

/** Does the workspace have any shared-inbox conversations at all? */
export async function hasAnalyticsData(orgId: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select exists (
      select 1 from conversations c
      inner join accounts a on a.id = c.account_id
      where c.org_id = ${orgId} and a.org_id = ${orgId} and a.owner_user_id is null and c.kind = 'email'
    ) as has`)
  return Boolean((rows[0] as { has?: boolean } | undefined)?.has)
}

/* ---------------------------------- KPIs ---------------------------------- */

export type KpiValue = { current: number | null; previous: number | null }
export type AnalyticsKpis = {
  received: KpiValue
  replies: KpiValue
  medianFirstResponse: KpiValue
  medianResolution: KpiValue
  open: number
  closed: KpiValue
}

export async function getKpis(q: Q): Promise<AnalyticsKpis> {
  const { from, to, prevFrom, prevTo, tz } = q.range
  const cur = (col: SQL) => between(col, from, to, tz)
  const prev = (col: SQL) => between(col, prevFrom, prevTo, tz)
  const created = sql`s.created_at`
  const closed = sql`s.closed_at`

  const [conv, replies] = await Promise.all([
    db.execute(sql`
      with s as (${scope(q, { assignee: true })})
      select
        count(*) filter (where s.has_inbound and ${cur(created)})::int as received,
        count(*) filter (where s.has_inbound and ${prev(created)})::int as received_prev,
        percentile_cont(0.5) within group (order by ${FRT}) filter (where ${cur(created)}) as frt,
        percentile_cont(0.5) within group (order by ${FRT}) filter (where ${prev(created)}) as frt_prev,
        percentile_cont(0.5) within group (order by ${RESOLUTION}) filter (where ${cur(closed)}) as resolution,
        percentile_cont(0.5) within group (order by ${RESOLUTION}) filter (where ${prev(closed)}) as resolution_prev,
        count(*) filter (where s.status = 'open' and (s.snoozed_until is null or s.snoozed_until <= now()))::int as open_now,
        count(*) filter (where ${cur(closed)})::int as closed,
        count(*) filter (where ${prev(closed)})::int as closed_prev
      from s`),
    db.execute(sql`
      with s as (${scope(q, { assignee: false })})
      select
        count(*) filter (where ${cur(sql`coalesce(m.sent_at, m.created_at)`)})::int as replies,
        count(*) filter (where ${prev(sql`coalesce(m.sent_at, m.created_at)`)})::int as replies_prev
      from messages m
      inner join s on s.id = m.conversation_id
      where ${repliesWhere(q)}
        and coalesce(m.sent_at, m.created_at) >= ${at(prevFrom, tz)}
        and coalesce(m.sent_at, m.created_at) < ${at(to, tz)}`),
  ])
  const c = (conv[0] ?? {}) as Record<string, unknown>
  const r = (replies[0] ?? {}) as Record<string, unknown>
  return {
    received: { current: num(c.received), previous: num(c.received_prev) },
    replies: { current: num(r.replies), previous: num(r.replies_prev) },
    medianFirstResponse: { current: numOrNull(c.frt), previous: numOrNull(c.frt_prev) },
    medianResolution: { current: numOrNull(c.resolution), previous: numOrNull(c.resolution_prev) },
    open: num(c.open_now),
    closed: { current: num(c.closed), previous: num(c.closed_prev) },
  }
}

/* ------------------------------ Time series ------------------------------ */

export type SeriesPoint = {
  /** Bucket start (YYYY-MM-DD, local) */
  date: string
  received: number
  replied: number
  /** Median first response in seconds for conversations started in the bucket */
  medianFirstResponse: number | null
}

export async function getTimeSeries(q: Q): Promise<SeriesPoint[]> {
  const { from, to, tz, granularity } = q.range
  const unit = granularity === "week" ? sql`'week'` : sql`'day'`
  const step = granularity === "week" ? sql`interval '1 week'` : sql`interval '1 day'`
  const bucket = (col: SQL) => sql`date_trunc(${unit}, (${col} at time zone ${tz}::text))::date`

  const rows = await db.execute(sql`
    with
      s as (${scope(q, { assignee: true })}),
      sb as (${scope(q, { assignee: false })}),
      buckets as (
        select d::date as d
        from generate_series(date_trunc(${unit}, ${from}::date::timestamp), (${to}::date - 1)::timestamp, ${step}) as d
      ),
      recv as (
        select ${bucket(sql`s.created_at`)} as d, count(*)::int as n,
          percentile_cont(0.5) within group (order by ${FRT}) as frt
        from s
        where s.has_inbound and ${between(sql`s.created_at`, from, to, tz)}
        group by 1
      ),
      repl as (
        select ${bucket(sql`coalesce(m.sent_at, m.created_at)`)} as d, count(*)::int as n
        from messages m
        inner join sb on sb.id = m.conversation_id
        where ${repliesWhere(q)} and ${between(sql`coalesce(m.sent_at, m.created_at)`, from, to, tz)}
        group by 1
      )
    select to_char(b.d, 'YYYY-MM-DD') as date,
      coalesce(recv.n, 0) as received,
      coalesce(repl.n, 0) as replied,
      recv.frt as frt
    from buckets b
    left join recv on recv.d = b.d
    left join repl on repl.d = b.d
    order by b.d`)

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date),
    received: num(r.received),
    replied: num(r.replied),
    medianFirstResponse: numOrNull(r.frt),
  }))
}

/* -------------------------------- Heatmap -------------------------------- */

export type HeatmapCell = { weekday: number; hour: number; count: number }

/** Inbound messages by ISO weekday (1 = Monday … 7 = Sunday) × local hour. */
export async function getBusiestHours(q: Q): Promise<HeatmapCell[]> {
  const { from, to, tz } = q.range
  const ts = sql`coalesce(m.received_at, m.created_at)`
  const rows = await db.execute(sql`
    with s as (${scope(q, { assignee: true })})
    select extract(isodow from (${ts} at time zone ${tz}::text))::int as weekday,
      extract(hour from (${ts} at time zone ${tz}::text))::int as hour,
      count(*)::int as n
    from messages m
    inner join s on s.id = m.conversation_id
    where m.direction = 'inbound' and ${between(ts, from, to, tz)}
    group by 1, 2`)
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    weekday: num(r.weekday),
    hour: num(r.hour),
    count: num(r.n),
  }))
}

/* --------------------------------- Labels -------------------------------- */

export type LabelStat = { id: string; name: string; color: string; count: number }

/** Shared labels on conversations created or active in the range. */
export async function getTopLabels(q: Q, limit = 8): Promise<LabelStat[]> {
  const { from, to, tz } = q.range
  const rows = await db.execute(sql`
    with s as (${scope(q, { assignee: true })})
    select l.id, l.name, l.color, count(distinct s.id)::int as n
    from conversation_labels cl
    inner join s on s.id = cl.conversation_id
    inner join labels l on l.id = cl.label_id
    where l.org_id = ${q.orgId}
      and l.visibility = 'shared'
      and (${between(sql`s.created_at`, from, to, tz)} or ${between(sql`s.last_message_at`, from, to, tz)})
    group by l.id, l.name, l.color
    order by n desc, l.name asc
    limit ${limit}`)
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    count: num(r.n),
  }))
}

/* -------------------------------- Teammates ------------------------------- */

export type TeammateStat = {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  assigned: number
  replies: number
  closed: number
  medianFirstResponse: number | null
}

export async function getTeammateStats(q: Q): Promise<TeammateStat[]> {
  const { from, to, tz } = q.range
  const rows = await db.execute(sql`
    with
      sb as (${scope(q, { assignee: false })}),
      assigned as (
        select ca.user_id, count(*)::int as n
        from conversation_assignees ca
        inner join sb on sb.id = ca.conversation_id
        where ${between(sql`ca.created_at`, from, to, tz)}
        group by 1
      ),
      replies as (
        select m.author_id as user_id, count(*)::int as n
        from messages m
        inner join sb on sb.id = m.conversation_id
        where m.direction = 'outbound' and m.status = 'sent' and m.author_id is not null
          and ${between(sql`coalesce(m.sent_at, m.created_at)`, from, to, tz)}
        group by 1
      ),
      closed as (
        select sb.closed_by as user_id, count(*)::int as n
        from sb
        where sb.closed_by is not null and ${between(sql`sb.closed_at`, from, to, tz)}
        group by 1
      ),
      first_out as (
        select distinct on (m.conversation_id) m.conversation_id, m.author_id, coalesce(m.sent_at, m.created_at) as at_ts
        from messages m
        inner join sb on sb.id = m.conversation_id
        where m.direction = 'outbound' and m.status = 'sent' and m.author_id is not null
        order by m.conversation_id, coalesce(m.sent_at, m.created_at)
      ),
      frt as (
        select fo.author_id as user_id,
          percentile_cont(0.5) within group (order by extract(epoch from (fo.at_ts - sb.created_at))) as v
        from first_out fo
        inner join sb on sb.id = fo.conversation_id
        where sb.has_inbound and fo.at_ts >= sb.created_at and ${between(sql`fo.at_ts`, from, to, tz)}
        group by 1
      )
    select u.id as user_id, u.name, u.email, u.avatar_url,
      coalesce(assigned.n, 0) as assigned,
      coalesce(replies.n, 0) as replies,
      coalesce(closed.n, 0) as closed,
      frt.v as frt
    from memberships mb
    inner join users u on u.id = mb.user_id
    left join assigned on assigned.user_id = u.id
    left join replies on replies.user_id = u.id
    left join closed on closed.user_id = u.id
    left join frt on frt.user_id = u.id
    where mb.org_id = ${q.orgId}
      and (mb.status = 'active' or assigned.n is not null or replies.n is not null or closed.n is not null)
      ${q.filters.userId ? sql`and u.id = ${q.filters.userId}` : sql``}
    order by coalesce(replies.n, 0) desc, coalesce(assigned.n, 0) desc, lower(coalesce(u.name, u.email))`)
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    name: (r.name as string | null) ?? null,
    email: String(r.email),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    assigned: num(r.assigned),
    replies: num(r.replies),
    closed: num(r.closed),
    medianFirstResponse: numOrNull(r.frt),
  }))
}

/* --------------------------------- Inboxes -------------------------------- */

export type InboxStat = {
  accountId: string
  name: string
  email: string
  color: string
  received: number
  replies: number
  medianFirstResponse: number | null
  open: number
  closed: number
}

export async function getInboxStats(q: Q): Promise<InboxStat[]> {
  const { from, to, tz } = q.range
  const rows = await db.execute(sql`
    with
      s as (${scope(q, { assignee: true })}),
      sb as (${scope(q, { assignee: false })}),
      conv as (
        select s.account_id,
          count(*) filter (where s.has_inbound and ${between(sql`s.created_at`, from, to, tz)})::int as received,
          percentile_cont(0.5) within group (order by ${FRT}) filter (where ${between(sql`s.created_at`, from, to, tz)}) as frt,
          count(*) filter (where s.status = 'open' and (s.snoozed_until is null or s.snoozed_until <= now()))::int as open_now,
          count(*) filter (where ${between(sql`s.closed_at`, from, to, tz)})::int as closed
        from s
        group by 1
      ),
      repl as (
        select sb.account_id, count(*)::int as n
        from messages m
        inner join sb on sb.id = m.conversation_id
        where ${repliesWhere(q)} and ${between(sql`coalesce(m.sent_at, m.created_at)`, from, to, tz)}
        group by 1
      )
    select a.id, a.name, a.email, a.color,
      coalesce(conv.received, 0) as received,
      coalesce(repl.n, 0) as replies,
      conv.frt as frt,
      coalesce(conv.open_now, 0) as open_now,
      coalesce(conv.closed, 0) as closed
    from accounts a
    left join conv on conv.account_id = a.id
    left join repl on repl.account_id = a.id
    where a.org_id = ${q.orgId} and a.owner_user_id is null
      ${q.filters.accountId ? sql`and a.id = ${q.filters.accountId}` : sql``}
    order by coalesce(conv.received, 0) desc, a.name asc`)
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    accountId: String(r.id),
    name: String(r.name),
    email: String(r.email),
    color: String(r.color),
    received: num(r.received),
    replies: num(r.replies),
    medianFirstResponse: numOrNull(r.frt),
    open: num(r.open_now),
    closed: num(r.closed),
  }))
}

/* -------------------------------- Overview -------------------------------- */

export type AnalyticsReport = {
  kpis: AnalyticsKpis
  series: SeriesPoint[]
  heatmap: HeatmapCell[]
  labels: LabelStat[]
  teammates: TeammateStat[]
  inboxes: InboxStat[]
}

export async function getAnalyticsReport(orgId: string, range: AnalyticsRange, filters: AnalyticsFilters): Promise<AnalyticsReport> {
  const q: Q = { orgId, range, filters }
  const [kpis, series, heatmap, labels, teammates, inboxes] = await Promise.all([
    getKpis(q),
    getTimeSeries(q),
    getBusiestHours(q),
    getTopLabels(q),
    getTeammateStats(q),
    getInboxStats(q),
  ])
  return { kpis, series, heatmap, labels, teammates, inboxes }
}
