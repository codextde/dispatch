import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import pkg from "../../../package.json"
import { getAppUrl, getDomain } from "@/server/env"
import { getSettings } from "@/server/settings"
import { getSetupStatus, printSetupBanner, runSetupChecks, savedSettingsSections } from "@/server/setup"
import { resolveHomePath } from "@/server/orgs"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { redactForAdmin } from "@/server/admin/settings"
import { AuthCard, CenteredAuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { SetupWizard } from "@/components/onboarding/setup-wizard"

export const metadata: Metadata = {
  title: "Set up Dispatch",
  robots: { index: false, follow: false },
}

/**
 * First-run setup wizard. Available only until setup is completed. Creating
 * the owner account is possible only while no super admin exists; afterwards
 * the wizard requires that super admin to be signed in.
 */
export default async function SetupPage() {
  const status = await getSetupStatus()
  if (status.completed) {
    redirect(status.session ? await resolveHomePath(status.session.user) : "/login")
  }

  const [general, branding, auth, email] = await Promise.all([
    getSettings("general"),
    getSettings("branding"),
    getSettings("auth"),
    getSettings("email"),
  ])
  const productName = branding.productName || general.instanceName || "Dispatch"

  // An owner exists but this visitor isn't signed in as them: sign in first.
  if (status.hasSuperAdmin && !status.isSetupActor) {
    const emailConfigured = await isEmailDeliveryConfigured()
    return (
      <CenteredAuthLayout productName={productName} homeHref="/setup">
        <AuthCard>
          <div className="mb-5 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
            <ShieldCheck className="size-5 text-brand" />
          </div>
          <p className="mb-6 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            Setup is in progress and an owner account already exists. Sign in with the owner&apos;s email address to continue.
          </p>
          <LoginForm next="/setup" emailConfigured={emailConfigured} />
        </AuthCard>
      </CenteredAuthLayout>
    )
  }

  // Unclaimed instance: (re)print the one-time setup code so it's in the recent logs
  if (!status.hasSuperAdmin) await printSetupBanner()

  const [checks, saved] = await Promise.all([runSetupChecks(), savedSettingsSections()])
  const owner = status.isSetupActor && status.session ? { name: status.session.user.name, email: status.session.user.email } : null
  const initialStep = !owner ? 0 : saved.has("email") ? 4 : saved.has("general") ? 3 : 2
  const redactedEmail = redactForAdmin(email)

  return (
    <SetupWizard
      initialStep={initialStep}
      productName={productName}
      version={pkg.version}
      appUrl={getAppUrl()}
      checks={[checks.database, checks.dataDir, checks.domain].map((c) => ({ label: c.label, ok: c.ok, detail: c.detail }))}
      owner={owner}
      general={{
        instanceName: general.instanceName,
        mode: general.mode,
        marketingSite: saved.has("general") ? general.marketingSite : general.mode === "saas",
      }}
      auth={{ signupMode: auth.signupMode, allowedSignupDomains: auth.allowedSignupDomains }}
      email={{
        provider: email.provider,
        host: email.host,
        port: email.port,
        secure: email.secure,
        user: email.user,
        sesRegion: email.sesRegion,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        replyTo: email.replyTo,
      }}
      emailPasswordPreview={redactedEmail.passwordEnc}
      defaultFromEmail={`no-reply@${getDomain().replace(/:\d+$/, "")}`}
    />
  )
}
