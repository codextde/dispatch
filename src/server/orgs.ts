import "server-only"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import { SYSTEM_ROLES, type SystemRoleKey } from "@/lib/permissions"
import { getSettings } from "@/server/settings"

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "login", "logout", "signup", "setup", "onboarding", "settings", "w",
  "www", "static", "_next", "public", "docs", "blog", "pricing", "features", "about", "legal", "help",
  "support", "status", "invite", "billing", "dashboard", "new", "account", "security", "self-hosting",
])

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  )
}

export async function uniqueSlug(base: string, tx: DbOrTx = db): Promise<string> {
  let slug = slugify(base)
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-team`
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`
    const exists = await tx.query.organizations.findFirst({
      where: eq(schema.organizations.slug, candidate),
      columns: { id: true },
    })
    if (!exists) return candidate
  }
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`
}

const DEFAULT_LABELS = [
  { name: "Urgent", color: "#ef4444" },
  { name: "Customer", color: "#22c55e" },
  { name: "Billing", color: "#f59e0b" },
  { name: "Bug", color: "#8b5cf6" },
  { name: "Feedback", color: "#0ea5e9" },
]

/**
 * Create a workspace with system roles, the creator as owner, and sensible
 * defaults. Billing/plan is derived from instance settings.
 */
export async function createOrganization(opts: { name: string; slug?: string; ownerId: string }) {
  const general = await getSettings("general")
  const billing = await getSettings("billing")
  const saasBilling = general.mode === "saas" && billing.enabled

  return db.transaction(async (tx) => {
    const slug = opts.slug ? await uniqueSlug(opts.slug, tx) : await uniqueSlug(opts.name, tx)
    const [org] = await tx
      .insert(schema.organizations)
      .values({
        name: opts.name.trim().slice(0, 80),
        slug,
        plan: saasBilling ? "cloud" : "self_hosted",
        subscriptionStatus: saasBilling && billing.trialDays > 0 ? "trialing" : "none",
        trialEndsAt: saasBilling && billing.trialDays > 0 ? new Date(Date.now() + billing.trialDays * 86_400_000) : null,
        createdBy: opts.ownerId,
        settings: { closeOnReply: false, reopenOnReply: true, undoSendSeconds: 5, assignmentStrategy: "none" },
      })
      .returning()

    const roleIds = {} as Record<SystemRoleKey, string>
    for (const [key, def] of Object.entries(SYSTEM_ROLES) as [SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]][]) {
      const [role] = await tx
        .insert(schema.roles)
        .values({
          orgId: org!.id,
          key,
          name: def.name,
          description: def.description,
          color: def.color,
          permissions: def.permissions,
          isSystem: true,
        })
        .returning({ id: schema.roles.id })
      roleIds[key] = role!.id
    }

    await tx
      .update(schema.organizations)
      .set({ settings: { ...org!.settings, defaultRoleId: roleIds.member } })
      .where(eq(schema.organizations.id, org!.id))

    await tx.insert(schema.memberships).values({ orgId: org!.id, userId: opts.ownerId, roleId: roleIds.owner })

    await tx.insert(schema.labels).values(
      DEFAULT_LABELS.map((l, i) => ({ orgId: org!.id, name: l.name, color: l.color, position: i }))
    )

    await tx.insert(schema.auditLogs).values({
      orgId: org!.id,
      actorId: opts.ownerId,
      action: "workspace.created",
      targetType: "organization",
      targetId: org!.id,
      metadata: { name: org!.name, slug },
    })

    return { ...org!, roleIds }
  })
}

/** Workspaces the user belongs to (active memberships). */
export async function listUserOrganizations(userId: string) {
  return db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      logoUrl: schema.organizations.logoUrl,
      roleName: schema.roles.name,
      roleKey: schema.roles.key,
      suspendedAt: schema.organizations.suspendedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, "active")))
    .orderBy(schema.organizations.name)
}

/** Where should a signed-in user land? */
export async function resolveHomePath(user: { id: string; preferences: { lastOrgSlug?: string } | null }) {
  const orgs = await listUserOrganizations(user.id)
  if (orgs.length === 0) return "/onboarding"
  const last = user.preferences?.lastOrgSlug
  const target = orgs.find((o) => o.slug === last) ?? orgs[0]!
  return `/w/${target.slug}/inbox`
}

/** Accept all pending (non-expired) invitations for an email address. */
export async function acceptPendingInvitationsForEmail(userId: string, email: string) {
  const pending = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        sql`lower(${schema.invitations.email}) = ${email.toLowerCase()}`,
        isNull(schema.invitations.acceptedAt),
        isNull(schema.invitations.revokedAt),
        gt(schema.invitations.expiresAt, new Date())
      )
    )
  for (const inv of pending) await acceptInvitation(inv, userId)
  return pending.length
}

export async function acceptInvitation(inv: typeof schema.invitations.$inferSelect, userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.memberships)
      .values({ orgId: inv.orgId, userId, roleId: inv.roleId })
      .onConflictDoNothing()
    for (const teamId of inv.teamIds) {
      await tx.insert(schema.teamMembers).values({ teamId, userId }).onConflictDoNothing()
    }
    await tx.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.id))
    await tx.insert(schema.auditLogs).values({
      orgId: inv.orgId,
      actorId: userId,
      action: "member.joined",
      targetType: "user",
      targetId: userId,
      metadata: { via: "invitation", invitationId: inv.id },
    })
  })
}

/** Allocate the next conversation number for an organization. */
export async function nextConversationNumber(orgId: string, tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .update(schema.organizations)
    .set({ conversationSeq: sql`${schema.organizations.conversationSeq} + 1` })
    .where(eq(schema.organizations.id, orgId))
    .returning({ seq: schema.organizations.conversationSeq })
  return row!.seq
}
