import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getSettings } from "@/server/settings"
import { getSetupStatus } from "@/server/setup"
import { safeRedirect } from "@/server/auth/magic-link"
import { resolveHomePath } from "@/server/orgs"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { unsign } from "@/server/crypto"
import { headers } from "next/headers"
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

const ERRORS_IT: Record<string, string> = {
  access_denied: "Accesso annullato.",
  oauth_denied: "Accesso annullato.",
  oauth_failed: "Impossibile completare l’accesso con questo provider. Riprova oppure usa la tua email.",
  oauth_state: "La sessione di accesso è scaduta. Riprova.",
  oauth_disabled: "Questo metodo di accesso non è attivo in questa istanza.",
  email_unverified: "Il provider non ha verificato il tuo indirizzo email. Accedi usando la tua email.",
  not_allowed: "L’accesso a questa istanza è solo su invito. Chiedi a un amministratore del workspace di invitarti.",
  domain: "Le registrazioni sono limitate ai domini email approvati.",
  invite_only: "L’accesso a questa istanza è solo su invito. Chiedi a un amministratore del workspace di invitarti.",
  disabled: "Questo account è stato disattivato. Contatta l’amministratore.",
  session_expired: "La sessione è scaduta. Accedi di nuovo.",
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams
  const italian = ((await headers()).get("accept-language") ?? "").toLowerCase().startsWith("it")
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
    notice = { tone: "error", text: signed?.slice(0, 300) || (italian ? ERRORS_IT[errorCode] : ERRORS[errorCode]) || (italian ? "Accesso non riuscito. Riprova." : "Sign-in failed. Please try again.") }
  }
  else if (first(sp.signed_out)) notice = { tone: "success", text: italian ? "Hai effettuato la disconnessione su questo dispositivo." : "You've been signed out on this device." }

  const signupHint =
    auth.signupMode === "open"
      ? italian ? "È la prima volta? Inserisci la tua email: creeremo il tuo account." : "New here? Enter your email — we'll create your account."
      : auth.signupMode === "domains"
        ? italian ? `È la prima volta? Usa un indirizzo email ${auth.allowedSignupDomains.map((d) => `@${d}`).join(", ")}.` : `New here? Sign up with your ${auth.allowedSignupDomains.map((d) => `@${d}`).join(", ")} email address.`
        : italian ? "È la prima volta? Ti serve un invito da un amministratore del workspace." : "New here? You'll need an invitation from a workspace admin."

  const showLegal = Boolean(legal.terms.trim() || legal.privacy.trim())
  const marketing = general.mode === "saas" && general.marketingSite

  return (
    <SplitAuthLayout
      productName={productName}
      homeHref={marketing ? "/" : "/login"}
      footer={
        showLegal ? (
          <>
            {italian ? "Continuando accetti i " : "By continuing you agree to the "}
            {legal.terms.trim() && (
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
                {italian ? "Termini" : "Terms"}
              </Link>
            )}
            {legal.terms.trim() && legal.privacy.trim() && " and "}
            {legal.privacy.trim() && (
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                {italian ? "Informativa privacy" : "Privacy Policy"}
              </Link>
            )}
            .
          </>
        ) : (
          <>{italian ? "Accesso con password o codice email · sessioni attive per " : "Sign in with a password or email code · sessions stay active for "}{auth.sessionDays >= 365 ? (italian ? "un anno" : "a year") : `${auth.sessionDays} ${italian ? "giorni" : "days"}`}</>
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
