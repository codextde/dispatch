import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Clock3, LogOut } from "lucide-react"
import { db, schema } from "@/server/db"
import { getAppUrl } from "@/server/env"
import { getSettings, isSetupComplete } from "@/server/settings"
import { can, loadOrgContext, requireUserPage } from "@/server/authz"
import { listUserOrganizations } from "@/server/orgs"
import { canCreateWorkspace } from "@/server/setup"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { AuthCard, AuthHeading, CenteredAuthLayout, ImpersonationBanner } from "@/components/auth/auth-layout"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { PendingInvitations } from "@/components/onboarding/pending-invitations"
import { formatMoney } from "@/components/admin/ui"

export const metadata: Metadata = {
  title: "Create your workspace",
  robots: { index: false, follow: false },
}

/**
 * Onboarding for signed-in users without a workspace (or `?new=1` to create
 * another). After creation the URL becomes `?w=<slug>` so the invite and
 * "get started" steps survive a reload.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const session = await requireUserPage("/onboarding")
  if (!(await isSetupComplete())) redirect("/setup")
  const sp = await searchParams
  const slug = typeof sp.w === "string" ? sp.w : null
  const wantsNew = sp.new === "1"
  const { user } = session

  const [orgs, general, branding, billing] = await Promise.all([
    listUserOrganizations(user.id),
    getSettings("general"),
    getSettings("branding"),
    getSettings("billing"),
  ])
  const productName = branding.productName || general.instanceName
  const lastSlug = user.preferences?.lastOrgSlug
  const home = orgs.length ? `/w/${(orgs.find((o) => o.slug === lastSlug) ?? orgs[0]!).slug}/inbox` : null

  let wizardWorkspace: { name: string; slug: string } | null = null
  let canInvite = true
  if (slug) {
    const ctx = await loadOrgContext(slug)
    if (!ctx) redirect(home ?? "/onboarding")
    // Onboarding steps are for workspace admins of a not-yet-onboarded workspace
    if (ctx.org.onboardingCompletedAt || !can(ctx, "settings.manage")) redirect(`/w/${ctx.org.slug}/inbox`)
    wizardWorkspace = { name: ctx.org.name, slug: ctx.org.slug }
    canInvite = can(ctx, "members.invite") && !ctx.locked
  } else if (home && !wantsNew) {
    redirect(home)
  }

  const header = (
    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
      <span className="hidden max-w-[16rem] truncate sm:inline">{user.email}</span>
      <form action="/auth/logout" method="post">
        <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  )
  const banner = session.session.impersonatorId ? <ImpersonationBanner email={user.email} /> : undefined

  // Creating workspaces may be restricted to super admins
  if (!wizardWorkspace && !(await canCreateWorkspace(user))) {
    const invitations = await db
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
      .where(
        and(
          sql`lower(${schema.invitations.email}) = ${user.email.toLowerCase()}`,
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          gt(schema.invitations.expiresAt, new Date())
        )
      )
    return (
      <CenteredAuthLayout productName={productName} homeHref={home ?? "/onboarding"} headerRight={header} banner={banner}>
        <AuthCard>
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
            <Clock3 className="size-5 text-muted-foreground" />
          </div>
          <AuthHeading
            eyebrow="Almost there"
            title={invitations.length ? "You've been invited." : "Ask your administrator for an invitation."}
            quiet={invitations.length ? "Join a workspace to get started." : undefined}
            description={
              invitations.length
                ? undefined
                : `New workspaces on ${productName} are created by the instance administrators. Once someone invites ${user.email}, the workspace appears here — or follow the link in the invitation email.`
            }
          />
          {invitations.length > 0 && (
            <PendingInvitations
              invitations={invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
            />
          )}
          {home && (
            <a href={home} className="mt-5 inline-block text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Back to your workspace
            </a>
          )}
        </AuthCard>
      </CenteredAuthLayout>
    )
  }

  const billingNote =
    general.mode === "saas" && billing.enabled
      ? `${billing.trialDays > 0 ? `${billing.trialDays}-day free trial, then ` : ""}${formatMoney(billing.amount, billing.currency)}/${billing.interval} per workspace`
      : null

  return (
    <CenteredAuthLayout productName={productName} homeHref={home ?? "/onboarding"} headerRight={header} banner={banner} width="md">
      <AuthCard className="sm:p-10">
        <OnboardingWizard
          initialStep={wizardWorkspace ? (canInvite ? 1 : 2) : 0}
          workspace={wizardWorkspace}
          needsName={!user.name}
          canInvite={canInvite}
          appUrl={getAppUrl()}
          emailConfigured={await isEmailDeliveryConfigured()}
          billingNote={billingNote}
          cancelHref={wantsNew && home ? home : null}
        />
      </AuthCard>
    </CenteredAuthLayout>
  )
}
