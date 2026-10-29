import type { Metadata } from "next"
import Link from "next/link"
import { LinkIcon, MailX } from "lucide-react"
import { getSettings } from "@/server/settings"
import { peekMagicToken } from "@/server/auth/magic-link"
import { getCurrentSession } from "@/server/auth/session"
import { AuthCard, AuthHeading, CenteredAuthLayout } from "@/components/auth/auth-layout"
import { VerifyForm } from "@/components/auth/verify-form"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Confirm sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * Landing page of the magic link. Rendering it never consumes the token (so
 * email security scanners can't burn it) — the user confirms with a click.
 */
export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const sp = await searchParams
  const token = typeof sp.token === "string" ? sp.token : ""
  const [peek, general, branding, session] = await Promise.all([
    token ? peekMagicToken(token) : null,
    getSettings("general"),
    getSettings("branding"),
    getCurrentSession(),
  ])
  const productName = branding.productName || general.instanceName
  const it = session?.user.locale === "it"

  return (
    <CenteredAuthLayout productName={productName} homeHref="/login">
      <AuthCard>
        {peek ? (
          <>
            <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
              <LinkIcon className="size-5 text-brand" />
            </div>
            <AuthHeading
              eyebrow={it ? "Conferma l’accesso" : "Confirm sign-in"}
              title={it ? `Accedi a ${productName}` : `Sign in to ${productName}`}
              quiet={it ? "su questo dispositivo." : "on this device."}
              description={
                <>
                  {it ? "Continua come" : "Continue as"} <span className="font-medium break-words text-foreground">{peek.email}</span>. {it ? "Questo link può essere usato una sola volta." : "This link can only be used once."}
                </>
              }
            />
            {session && session.user.email.toLowerCase() !== peek.email && (
              <p className="-mt-2 mb-5 text-[13px] text-muted-foreground">
                {it ? "Hai già effettuato l’accesso come" : "You’re currently signed in as"} <span className="font-medium text-foreground">{session.user.email}</span> {it ? "su questo dispositivo. Continuando aggiungerai una sessione per" : "on this device. Continuing adds a session for"} {peek.email}.
              </p>
            )}
            <VerifyForm token={token} email={peek.email} />
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              {it ? "Non hai richiesto questo accesso? Puoi chiudere la pagina: non succede nulla finché non fai clic su Continua." : "Didn’t request this? You can close this page — nothing happens until you click continue."}
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
              <MailX className="size-5 text-muted-foreground" />
            </div>
            <AuthHeading
              eyebrow={it ? "Link di accesso" : "Sign-in link"}
              title={it ? "Questo link è scaduto" : "This link has expired"}
              quiet={it ? "oppure è già stato usato." : "or was already used."}
              description={it ? "I link di accesso sono validi per poco tempo e si possono usare una sola volta. Richiedine uno nuovo: ti invieremo un altro link e un nuovo codice." : "Sign-in links are valid for a short time and work only once. Request a new one and we'll email you a fresh link and code."}
            />
            <Button asChild size="lg" className="h-10 w-full rounded-md">
              <Link href="/login">{it ? "Richiedi un nuovo link" : "Request a new link"}</Link>
            </Button>
          </>
        )}
      </AuthCard>
    </CenteredAuthLayout>
  )
}
