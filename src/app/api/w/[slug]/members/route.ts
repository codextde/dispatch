import { and, asc, eq, sql } from "drizzle-orm"
import { json, requireApiOrg, route } from "@/server/api"
import { db, schema } from "@/server/db"
import type { MemberSummary } from "@/lib/inbox/types"

/** GET /api/w/[slug]/members → { items: MemberSummary[] } (active members, for mentions & assignment) */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      lastSeenAt: schema.users.lastSeenAt,
      title: schema.memberships.title,
      roleKey: schema.roles.key,
      roleName: schema.roles.name,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.status, "active"), eq(schema.users.status, "active")))
    .orderBy(asc(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`))
  const items: MemberSummary[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    avatarUrl: m.avatarUrl,
    title: m.title,
    role: { key: m.roleKey, name: m.roleName },
    lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
  }))
  return json({ items })
})
