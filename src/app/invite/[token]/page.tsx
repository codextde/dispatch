/* eslint-disable @next/next/no-img-element -- workspace logos are user-provided URLs/uploads, not optimizable assets */
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { and, eq } from "drizzle-orm"
import { CalendarX2, MailX, ShieldOff } from "lucide-react"
import { db, schema } from "@/server/db"
import { hashToken } from "@/server/crypto"
import { getSettings } from "@/server/settings"
import { getCurrentSession } from "@/server/auth/session"
import { AuthCard, AuthHeading, CenteredAuthLayout } from "@/components/auth/auth-layout"
import { ImpersonationBanner } from "@/components/auth/impersonation-banner"
import { InviteActions } from "@/components/auth/invite-actions"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { LocalTime } from "@/components/app/local-time"
import { InvitePasswordForm } from "@/components/auth/invite-password-form"

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const [general, branding, session] = await Promise.all([getSettings("general"), getSettings("branding"), getCurrentSession()])
  const requestHeaders = await headers()
  const preferredLocale = (await cookies()).get("dispatch-locale")?.value
  const italian = session?.user.locale === "it" || (!session && (preferredLocale === "it" || (!preferredLocale && requestHeaders.get("accept-language")?.toLowerCase().startsWith("it"))))
  const productName = branding.productName || general.instanceName

  const rows =
    token.length >= 20 && token.length <= 200
      ? await db
          .select({ inv: schema.invitations, org: schema.organizations, role: schema.roles, inviter: schema.users })
          .from(schema.invitations)
          .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.orgId))
          .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
          .leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
          .where(eq(schema.invitations.tokenHash, hashToken(token)))
          .limit(1)
      : []
  const row = rows[0]

  const isMember =
    row && session
      ? Boolean(
          await db.query.memberships.findFirst({
            where: and(
              eq(schema.memberships.orgId, row.org.id),
              eq(schema.memberships.userId, session.user.id),
              eq(schema.memberships.status, "active")
            ),
            columns: { id: true },
          })
        )
      : false
  // Already in (e.g. the invitation was accepted automatically when signing in)
  if (row && isMember && !row.inv.revokedAt) redirect(`/w/${row.org.slug}/inbox`)

  const banner = session?.session.impersonatorId ? <ImpersonationBanner email={session.user.email} /> : undefined
  const homeHref = "/login"
  const copy = italian
    ? {
        invitation: "Invito",
        notFound: "Invito non trovato",
        invalidLink: "Questo link di invito non è valido. Controlla di aver copiato il link completo oppure chiedi un nuovo invito.",
        withdrawn: "Questo invito è stato ritirato",
        revoked: (workspace: string) => `Un amministratore di ${workspace} lo ha revocato. Chiedi di essere invitato di nuovo.`,
        alreadyUsed: "Questo invito è già stato utilizzato",
        signInToOpen: (email: string, workspace: string) => `Accedi con ${email} per aprire ${workspace}.`,
        expired: "Questo invito è scaduto",
        expiredText: (workspace: string) => `Gli inviti sono validi per 14 giorni. Chiedi a un amministratore di ${workspace} di inviarne uno nuovo.`,
        goWorkspace: "Vai al tuo workspace",
        signIn: "Accedi",
        join: "Unisciti a",
        on: "su",
        invited: "ha invitato",
        collaborate: "a collaborare: caselle condivise, commenti interni e assegnazioni, tutto in un unico posto.",
        existingPassword: "Hai già una password?",
        signInInstead: "Accedi invece",
        signedAs: "Hai effettuato l'accesso come",
        butInvitation: "ma questo invito è per",
        switchAccount: "Esci da questo dispositivo e continua con l'indirizzo invitato.",
        validUntil: "Invito valido fino al",
      }
    : {
        invitation: "Invitation",
        notFound: "Invitation not found",
        invalidLink: "This invitation link is invalid. Check that you copied the whole link, or ask for a new invitation.",
        withdrawn: "This invitation was withdrawn",
        revoked: (workspace: string) => `An admin of ${workspace} revoked it. Ask them to invite you again.`,
        alreadyUsed: "This invitation was already used",
        signInToOpen: (email: string, workspace: string) => `Sign in with ${email} to open ${workspace}.`,
        expired: "This invitation has expired",
        expiredText: (workspace: string) => `Invitations are valid for 14 days. Ask an admin of ${workspace} to send a new one.`,
        goWorkspace: "Go to your workspace",
        signIn: "Sign in",
        join: "Join",
        on: "on",
        invited: "invited",
        collaborate: "to collaborate: shared inboxes, internal comments and assignments — all in one place.",
        existingPassword: "Already have a password?",
        signInInstead: "Sign in instead",
        signedAs: "You're signed in as",
        butInvitation: "but this invitation is for",
        switchAccount: "Sign out on this device and continue with the invited address.",
        validUntil: "Invitation valid until",
      }

  if (!row || row.inv.revokedAt || row.inv.acceptedAt || row.inv.expiresAt < new Date()) {
    const state = !row ? "missing" : row.inv.revokedAt ? "revoked" : row.inv.acceptedAt ? "accepted" : "expired"
    const stateCopy = {
      missing: { icon: MailX, title: copy.notFound, quiet: "", text: copy.invalidLink },
      revoked: { icon: ShieldOff, title: copy.withdrawn, quiet: "", text: copy.revoked(row?.org.name ?? (italian ? "workspace" : "the workspace")) },
      accepted: { icon: MailX, title: copy.alreadyUsed, quiet: "", text: copy.signInToOpen(row?.inv.email ?? (italian ? "l'indirizzo invitato" : "the invited address"), row?.org.name ?? (italian ? "il workspace" : "the workspace")) },
      expired: { icon: CalendarX2, title: copy.expired, quiet: "", text: copy.expiredText(row?.org.name ?? (italian ? "il workspace" : "the workspace")) },
    }[state]
    return (
      <CenteredAuthLayout productName={productName} homeHref={homeHref} banner={banner}>
        <AuthCard>
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
            <stateCopy.icon className="size-5 text-muted-foreground" />
          </div>
          <AuthHeading eyebrow={copy.invitation} title={stateCopy.title} description={stateCopy.text} />
          <Button asChild size="lg" variant={session ? "outline" : "default"} className="h-10 w-full rounded-md">
            <Link href={session ? "/" : state === "accepted" && row ? `/login?email=${encodeURIComponent(row.inv.email)}` : "/login"}>
              {session ? copy.goWorkspace : copy.signIn}
            </Link>
          </Button>
        </AuthCard>
      </CenteredAuthLayout>
    )
  }

  const { inv, org, role, inviter } = row
  const inviterName = inviter?.name || inviter?.email || "A teammate"
  const translatedRole = italian ? ({ owner: "Proprietario", admin: "Amministratore", member: "Membro", guest: "Ospite" }[role.key ?? ""] ?? role.name) : role.name
  const signedInAs = session?.user.email.toLowerCase()
  const matches = signedInAs === inv.email.toLowerCase()

  return (
    <CenteredAuthLayout productName={productName} homeHref={homeHref} banner={banner}>
      <AuthCard>
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-lg font-semibold text-background">
            {org.logoUrl ? <img src={org.logoUrl} alt="" className="size-12 object-cover" /> : org.name.slice(0, 1).toUpperCase()}
          </span>
          {inviter && (
            <span className="-ml-5 rounded-full ring-4 ring-card">
              <UserAvatar name={inviter.name} email={inviter.email} src={inviter.avatarUrl} size="md" />
            </span>
          )}
        </div>
        <AuthHeading
          eyebrow={copy.invitation}
          title={`${copy.join} ${org.name}`}
          quiet={`${copy.on} ${productName}.`}
          description={
            <>
              <span className="font-medium text-foreground">{inviterName}</span> {copy.invited}{" "}
              <span className="font-medium break-words text-foreground">{inv.email}</span> to collaborate as{" "}
              <span className="inline-flex items-center rounded-sm border border-border bg-surface px-1.5 py-px font-mono text-[11px] uppercase tracking-wider text-foreground">
                {translatedRole}
              </span>{" "}{copy.collaborate}
            </>
          }
        />

        {!session ? (
          <>
            <InvitePasswordForm token={token} email={inv.email} />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {copy.existingPassword}{" "}<Link className="underline underline-offset-2" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(inv.email)}`}>{copy.signInInstead}</Link>.
            </p>
          </>
        ) : matches ? (
          <InviteActions token={token} mode="accept" orgName={org.name} />
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
              {copy.signedAs} <span className="font-medium break-words">{session.user.email}</span>, {copy.butInvitation}{" "}
              <span className="font-medium break-words">{inv.email}</span>. {copy.switchAccount}
            </div>
            <InviteActions token={token} mode="switch" orgName={org.name} />
          </>
        )}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">{copy.validUntil} <LocalTime date={inv.expiresAt} format="date" />.</p>
      </AuthCard>
    </CenteredAuthLayout>
  )
}
