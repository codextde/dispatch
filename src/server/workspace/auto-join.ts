import "server-only"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { verifiedAdminDomains } from "@/server/workspace/services/general"

/**
 * Auto-join by email domain (Settings → General → Joining the workspace).
 *
 * Call after a user has proven ownership of `email` (magic link / OAuth login):
 * the user joins every active workspace that enabled `autoJoinDomains` for the
 * email's domain, with the workspace's default role (never owner). Existing
 * memberships (including suspended ones) are left untouched.
 *
 * Returns the slugs of the workspaces joined.
 */
export async function joinWorkspacesByEmailDomain(userId: string, email: string): Promise<string[]> {
  const domain = email.trim().toLowerCase().split("@")[1]
  if (!domain) return []

  const candidates = await db
    .select({ id: schema.organizations.id, slug: schema.organizations.slug, settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(
      and(
        isNull(schema.organizations.suspendedAt),
        sql`(${schema.organizations.settings}->>'autoJoinDomains')::boolean is true`,
        sql`${schema.organizations.settings}->'allowedDomains' ? ${domain}`,
        sql`not exists (select 1 from memberships m where m.org_id = ${schema.organizations.id} and m.user_id = ${userId})`
      )
    )

  const joined: string[] = []
  for (const org of candidates) {
    // The domain must still belong to one of the workspace's admins
    if (!(await verifiedAdminDomains(org.id)).has(domain)) continue
    const roles = await db
      .select({ id: schema.roles.id, key: schema.roles.key })
      .from(schema.roles)
      .where(eq(schema.roles.orgId, org.id))
    const role =
      roles.find((r) => r.id === org.settings.defaultRoleId && r.key !== "owner") ?? roles.find((r) => r.key === "member")
    if (!role) continue
    const inserted = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(schema.memberships)
        .values({ orgId: org.id, userId, roleId: role.id })
        .onConflictDoNothing()
        .returning({ id: schema.memberships.id })
      if (!m) return false
      await tx.insert(schema.auditLogs).values({
        orgId: org.id,
        actorId: userId,
        actorEmail: email,
        action: "member.joined",
        targetType: "user",
        targetId: userId,
        metadata: { via: "auto_join", domain },
      })
      return true
    })
    if (inserted) joined.push(org.slug)
  }
  return joined
}
