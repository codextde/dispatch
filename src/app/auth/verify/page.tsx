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

  return (
    <CenteredAuthLayout productName={productName} homeHref="/login">
      <AuthCard>
        {peek ? (
          <>
            <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
              <LinkIcon className="size-5 text-brand" />
            </div>
            <AuthHeading
              eyebrow="Confirm sign-in"
              title={`Sign in to ${productName}`}
              quiet="on this device."
              description={
                <>
                  Continue as <span className="font-medium break-words text-foreground">{peek.email}</span>. This link can only be used
                  once.
                </>
              }
            />
            {session && session.user.email.toLowerCase() !== peek.email && (
              <p className="-mt-2 mb-5 text-[13px] text-muted-foreground">
                You&apos;re currently signed in as <span className="font-medium text-foreground">{session.user.email}</span> on this
                device. Continuing adds a session for {peek.email}.
              </p>
            )}
            <VerifyForm token={token} email={peek.email} />
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Didn&apos;t request this? You can close this page — nothing happens until you click continue.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
              <MailX className="size-5 text-muted-foreground" />
            </div>
            <AuthHeading
              eyebrow="Sign-in link"
              title="This link has expired"
              quiet="or was already used."
              description="Sign-in links are valid for a short time and work only once. Request a new one and we'll email you a fresh link and code."
            />
            <Button asChild size="lg" className="h-10 w-full rounded-md">
              <Link href="/login">Request a new link</Link>
            </Button>
          </>
        )}
      </AuthCard>
    </CenteredAuthLayout>
  )
}
