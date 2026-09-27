import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getSettings } from "@/server/settings"
import { getSetupStatus } from "@/server/setup"
import { safeRedirect } from "@/server/auth/magic-link"
import { resolveHomePath } from "@/server/orgs"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { unsign } from "@/server/crypto"
import { SplitAuthLayout } from "@/components/auth/auth-layout"
import { LoginForm, type LoginNotice } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
}

/**
 * `?error=` is either a known code or a human-readable message signed by the
 * server with `sign(message, "login-error")` (e.g. by the OAuth callback).
 * Unsigned free text is never rendered, so nobody can craft a login link that
 * shows their own text on this page.
 */
const ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  oauth_denied: "Sign-in was cancelled.",
  oauth_failed: "We couldn't complete the sign-in with that provider. Please try again or use your email.",
  oauth_state: "Your sign-in session expired. Please try again.",
  oauth_disabled: "That sign-in method is not enabled on this instance.",
  email_unverified: "Your provider didn't confirm that email address. Please sign in with your email instead.",
  not_allowed: "This instance is invite-only. Ask a workspace admin to invite you.",
  domain: "Sign-ups are restricted to approved email domains.",
  invite_only: "This instance is invite-only. Ask a workspace admin to invite you.",
  disabled: "This account has been disabled. Contact your administrator.",
  session_expired: "Your session has expired. Please sign in again.",
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams
  const next = safeRedirect(first(sp.next), "") || undefined

  const status = await getSetupStatus()
  if (!status.completed) redirect("/setup")
  if (status.session) redirect(next ?? (await resolveHomePath(status.session.user)))

  const [general, branding, auth, oauth, legal, emailConfigured] = await Promise.all([
    getSettings("general"),
    getSettings("branding"),
    getSettings("auth"),
    getSettings("oauth"),
    getSettings("legal"),
    isEmailDeliveryConfigured(),
  ])
  const productName = branding.productName || general.instanceName

  const emailParam = first(sp.email)?.trim().slice(0, 254) ?? ""
  const initialEmail = /^[^\s@]+@[^\s@]+$/.test(emailParam) ? emailParam : ""

  const errorCode = first(sp.error)
  let notice: LoginNotice | null = null
  if (errorCode) {
    const signed = errorCode.length <= 600 ? unsign(errorCode, "login-error") : null
    notice = { tone: "error", text: signed?.slice(0, 300) || ERRORS[errorCode] || "Sign-in failed. Please try again." }
  }
  else if (first(sp.signed_out)) notice = { tone: "success", text: "You've been signed out on this device." }

  const signupHint =
    auth.signupMode === "open"
      ? "New here? Enter your email — we'll create your account."
      : auth.signupMode === "domains"
        ? `New here? Sign up with your ${auth.allowedSignupDomains.map((d) => `@${d}`).join(", ")} email address.`
        : "New here? You'll need an invitation from a workspace admin."

  const showLegal = Boolean(legal.terms.trim() || legal.privacy.trim())
  const marketing = general.mode === "saas" && general.marketingSite

  return (
    <SplitAuthLayout
      productName={productName}
      homeHref={marketing ? "/" : "/login"}
      footer={
        showLegal ? (
          <>
            By continuing you agree to the{" "}
            {legal.terms.trim() && (
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
                Terms
              </Link>
            )}
            {legal.terms.trim() && legal.privacy.trim() && " and "}
            {legal.privacy.trim() && (
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy Policy
              </Link>
            )}
            .
          </>
        ) : (
          <>Passwordless sign-in · sessions stay active for {auth.sessionDays >= 365 ? "a year" : `${auth.sessionDays} days`}</>
        )
      }
    >
      <LoginForm
        next={next}
        initialEmail={initialEmail}
        emailConfigured={emailConfigured}
        notice={notice}
        signupHint={signupHint}
        providers={{
          google: auth.googleLogin && oauth.google.enabled,
          microsoft: auth.microsoftLogin && oauth.microsoft.enabled,
        }}
      />
    </SplitAuthLayout>
  )
}
