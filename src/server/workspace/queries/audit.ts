import "server-only"
import { and, desc, eq, gte, ilike, like, lt, or, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { db, schema } from "@/server/db"

export const AUDIT_PAGE_SIZE = 50

export const auditFilterSchema = z.object({
  actor: z.uuid().optional().catch(undefined),
  /** Exact action ("member.invited") or a resource prefix ("member.*") */
  action: z
    .string()
    .regex(/^[a-z_]+(\.[a-z_*]+)?$/)
    .max(64)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
})
export type AuditFilters = z.infer<typeof auditFilterSchema>

export type AuditRow = {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  ip: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  actor: { id: string | null; name: string | null; email: string | null; avatarUrl: string | null }
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function listAuditLogs(orgId: string, filters: AuditFilters) {
  const a = schema.auditLogs
  const u = schema.users
  const conds: (SQL | undefined)[] = [eq(a.orgId, orgId)]
  if (filters.actor) conds.push(eq(a.actorId, filters.actor))
  if (filters.action) {
    conds.push(filters.action.endsWith(".*") ? like(a.action, `${escapeLike(filters.action.slice(0, -2))}.%`) : eq(a.action, filters.action))
  }
  if (filters.q) {
    const q = `%${escapeLike(filters.q)}%`
    conds.push(
      or(
        ilike(a.action, q),
        ilike(a.actorEmail, q),
        ilike(a.targetId, q),
        ilike(a.ip, q),
        sql`${a.metadata}::text ilike ${q}`
      )
    )
  }
  if (filters.from) conds.push(gte(a.createdAt, new Date(`${filters.from}T00:00:00Z`)))
  if (filters.to) conds.push(lt(a.createdAt, new Date(new Date(`${filters.to}T00:00:00Z`).getTime() + 86_400_000)))
  const where = and(...conds)

  const page = filters.page ?? 1
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: a.id,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        ip: a.ip,
        userAgent: a.userAgent,
        metadata: a.metadata,
        createdAt: a.createdAt,
        actorId: a.actorId,
        actorEmail: a.actorEmail,
        userName: u.name,
        userEmail: u.email,
        userAvatar: u.avatarUrl,
      })
      .from(a)
      .leftJoin(u, eq(u.id, a.actorId))
      .where(where)
      .orderBy(desc(a.createdAt), desc(a.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(a).where(where),
  ])

  const items: AuditRow[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    ip: r.ip,
    userAgent: r.userAgent,
    metadata: r.metadata,
    createdAt: r.createdAt,
    actor: { id: r.actorId, name: r.userName, email: r.userEmail ?? r.actorEmail, avatarUrl: r.userAvatar },
  }))
  return { items, total, page, pageSize: AUDIT_PAGE_SIZE, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) }
}

/** Filter options: actions and actors that appear in this workspace's log. */
export async function listAuditFacets(orgId: string) {
  const a = schema.auditLogs
  const u = schema.users
  const [actions, actors] = await Promise.all([
    db
      .select({ action: a.action, n: sql<number>`count(*)::int` })
      .from(a)
      .where(eq(a.orgId, orgId))
      .groupBy(a.action)
      .orderBy(a.action),
    db
      .selectDistinct({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })
      .from(a)
      .innerJoin(u, eq(u.id, a.actorId))
      .where(eq(a.orgId, orgId)),
  ])
  return {
    actions: actions.map((r) => ({ action: r.action, count: r.n })),
    actors: actors.sort((x, y) => (x.name ?? x.email).localeCompare(y.name ?? y.email)),
  }
}
