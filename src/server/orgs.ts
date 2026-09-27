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
 * Has this user already started a free trial? Trials are recorded as an
 * instance-level audit entry (it survives deleting the workspace); workspaces
 * created before that entry existed count through their trial date.
 */
export async function hasUsedTrial(userId: string, tx: DbOrTx = db): Promise<boolean> {
  const rows = await tx.execute<{ used: boolean }>(sql`
    select exists (select 1 from audit_logs where org_id is null and action = 'billing.trial_started' and actor_id = ${userId})
        or exists (select 1 from organizations where created_by = ${userId} and trial_ends_at is not null) as used`)
  return Boolean(rows[0]?.used)
}

/**
 * Create a workspace with system roles, the creator as owner, and sensible
 * defaults. Billing/plan is derived from instance settings. In SaaS mode only
 * a user's first workspace gets a free trial.
 */
export async function createOrganization(opts: { name: string; slug?: string; ownerId: string }) {
  const general = await getSettings("general")
  const billing = await getSettings("billing")
  const saasBilling = general.mode === "saas" && billing.enabled

  return db.transaction(async (tx) => {
    // Serialize workspace creation per user so parallel requests can't each claim a trial
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`org-create:${opts.ownerId}`}))`)
    const trial = saasBilling && billing.trialDays > 0 && !(await hasUsedTrial(opts.ownerId, tx))
    const slug = opts.slug ? await uniqueSlug(opts.slug, tx) : await uniqueSlug(opts.name, tx)
    const [org] = await tx
      .insert(schema.organizations)
      .values({
        name: opts.name.trim().slice(0, 80),
        slug,
        plan: saasBilling ? "cloud" : "self_hosted",
        subscriptionStatus: trial ? "trialing" : "none",
        trialEndsAt: trial ? new Date(Date.now() + billing.trialDays * 86_400_000) : null,
        createdBy: opts.ownerId,
        settings: { closeOnReply: false, reopenOnReply: true, undoSendSeconds: 5, assignmentStrategy: "none" },
      })
      .returning()
    if (trial) {
      await tx.insert(schema.auditLogs).values({
        orgId: null,
        actorId: opts.ownerId,
        action: "billing.trial_started",
        targetType: "organization",
        targetId: org!.id,
        metadata: { days: billing.trialDays },
      })
    }

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

/**
 * Where to go right after signing in: existing users with pending invitations
 * see them first (invitations are only accepted automatically for brand-new
 * accounts), everyone else lands in their workspace.
 */
export async function resolveLoginHomePath(
  user: { id: string; email: string; preferences: { lastOrgSlug?: string } | null },
  isNewUser: boolean
) {
  if (!isNewUser && (await hasPendingInvitations(user))) return "/onboarding?invitations=1"
  return resolveHomePath(user)
}

function pendingInvitationsWhere(email: string) {
  return and(
    sql`lower(${schema.invitations.email}) = ${email.toLowerCase()}`,
    isNull(schema.invitations.acceptedAt),
    isNull(schema.invitations.revokedAt),
    gt(schema.invitations.expiresAt, new Date())
  )
}

/**
 * Accept all pending (non-expired) invitations for an email address. Only for
 * accounts created by this sign-in: existing users choose which invitations to
 * accept (see `listPendingInvitations` and /onboarding?invitations=1).
 */
export async function acceptPendingInvitationsForEmail(userId: string, email: string) {
  const pending = await db.select().from(schema.invitations).where(pendingInvitationsWhere(email))
  for (const inv of pending) await acceptInvitation(inv, userId)
  return pending.length
}

/** Invitations to active workspaces the user hasn't joined yet */
function openInvitationsWhere(user: { id: string; email: string }) {
  return and(
    pendingInvitationsWhere(user.email),
    sql`${schema.organizations.suspendedAt} is null`,
    sql`not exists (select 1 from memberships m where m.org_id = ${schema.invitations.orgId} and m.user_id = ${user.id})`
  )
}

/** Pending invitations for the user's email address, for the "You've been invited" screen. */
export async function listPendingInvitations(user: { id: string; email: string }) {
  return db
    .select({
      id: schema.invitations.id,
      orgName: schema.organizations.name,
      orgLogoUrl: schema.organizations.logoUrl,
      roleName: schema.roles.name,
      inviterName: sql<string | null>`coalesce(${schema.users.name}, ${schema.users.email})`,
      expiresAt: schema.invitations.expiresAt,
    })
    .from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.orgId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
    .leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
    .where(openInvitationsWhere(user))
    .orderBy(schema.invitations.createdAt)
}

/** Does the user have pending invitations to active workspaces they haven't joined? */
export async function hasPendingInvitations(user: { id: string; email: string }): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.orgId))
    .where(openInvitationsWhere(user))
    .limit(1)
  return Boolean(row)
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
