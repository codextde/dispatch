import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Clock3, LogOut, MailPlus } from "lucide-react"
import { getAppUrl } from "@/server/env"
import { getSettings, isSetupComplete } from "@/server/settings"
import { can, loadOrgContext, requireUserPage } from "@/server/authz"
import { hasUsedTrial, listPendingInvitations, listUserOrganizations } from "@/server/orgs"
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
 * "get started" steps survive a reload. `?invitations=1` (after signing in
 * with pending invitations) lists them so the user can choose which to join.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const session = await requireUserPage("/onboarding")
  if (!(await isSetupComplete())) redirect("/setup")
  const sp = await searchParams
  const slug = typeof sp.w === "string" ? sp.w : null
  const wantsNew = sp.new === "1"
  const { user } = session

  const [orgs, general, branding, billing, invitations] = await Promise.all([
    listUserOrganizations(user.id),
    getSettings("general"),
    getSettings("branding"),
    getSettings("billing"),
    listPendingInvitations(user),
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
    // A read-only workspace (e.g. no trial left) can't be set up until it's subscribed
    if (ctx.locked) {
      redirect(ctx.locked.reason === "billing" && can(ctx, "billing.manage") ? `/w/${ctx.org.slug}/settings/billing` : `/w/${ctx.org.slug}/inbox`)
    }
    wizardWorkspace = { name: ctx.org.name, slug: ctx.org.slug }
    canInvite = can(ctx, "members.invite")
  } else if (home && !wantsNew && !(sp.invitations === "1" && invitations.length)) {
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

  // Pending invitations are never accepted behind the user's back: they choose here
  const canCreate = await canCreateWorkspace(user)
  if (!wizardWorkspace && ((invitations.length && !wantsNew) || !canCreate)) {
    return (
      <CenteredAuthLayout productName={productName} homeHref={home ?? "/onboarding"} headerRight={header} banner={banner}>
        <AuthCard>
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
            {invitations.length ? <MailPlus className="size-5 text-brand" /> : <Clock3 className="size-5 text-muted-foreground" />}
          </div>
          <AuthHeading
            eyebrow={invitations.length ? "Invitations" : "Almost there"}
            title={invitations.length ? "You've been invited." : "Ask your administrator for an invitation."}
            quiet={invitations.length ? "Choose the workspaces to join." : undefined}
            description={
              invitations.length
                ? `Invitations sent to ${user.email}. Only join workspaces you recognize — you can ignore the others.`
                : `New workspaces on ${productName} are created by the instance administrators. Once someone invites ${user.email}, the workspace appears here — or follow the link in the invitation email.`
            }
          />
          {invitations.length > 0 && (
            <PendingInvitations
              invitations={invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
            />
          )}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {home && (
              <a href={home} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                {invitations.length ? "Not now — continue to your workspace" : "Back to your workspace"}
              </a>
            )}
            {canCreate && invitations.length > 0 && (
              <a href="/onboarding?new=1" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Create a new workspace instead
              </a>
            )}
          </div>
        </AuthCard>
      </CenteredAuthLayout>
    )
  }

  // Only a user's first workspace comes with a free trial
  const saasBilling = general.mode === "saas" && billing.enabled
  const trial = saasBilling && billing.trialDays > 0 && !(await hasUsedTrial(user.id))
  const billingNote = saasBilling
    ? `${trial ? `${billing.trialDays}-day free trial, then ` : ""}${formatMoney(billing.amount, billing.currency)}/${billing.interval} per workspace`
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
