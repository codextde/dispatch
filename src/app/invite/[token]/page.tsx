/* eslint-disable @next/next/no-img-element -- workspace logos are user-provided URLs/uploads, not optimizable assets */
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { CalendarX2, MailX, ShieldOff } from "lucide-react"
import { db, schema } from "@/server/db"
import { hashToken } from "@/server/crypto"
import { getSettings } from "@/server/settings"
import { getCurrentSession } from "@/server/auth/session"
import { AuthCard, AuthHeading, CenteredAuthLayout, ImpersonationBanner } from "@/components/auth/auth-layout"
import { InviteActions } from "@/components/auth/invite-actions"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { LocalTime } from "@/components/app/local-time"

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const [general, branding, session] = await Promise.all([getSettings("general"), getSettings("branding"), getCurrentSession()])
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

  if (!row || row.inv.revokedAt || row.inv.acceptedAt || row.inv.expiresAt < new Date()) {
    const state = !row ? "missing" : row.inv.revokedAt ? "revoked" : row.inv.acceptedAt ? "accepted" : "expired"
    const copy = {
      missing: { icon: MailX, title: "Invitation not found", quiet: "", text: "This invitation link is invalid. Check that you copied the whole link, or ask for a new invitation." },
      revoked: { icon: ShieldOff, title: "This invitation was withdrawn", quiet: "", text: `An admin of ${row?.org.name ?? "the workspace"} revoked it. Ask them to invite you again.` },
      accepted: { icon: MailX, title: "This invitation was already used", quiet: "", text: `Sign in with ${row?.inv.email ?? "the invited address"} to open ${row?.org.name ?? "the workspace"}.` },
      expired: { icon: CalendarX2, title: "This invitation has expired", quiet: "", text: `Invitations are valid for 14 days. Ask an admin of ${row?.org.name ?? "the workspace"} to send a new one.` },
    }[state]
    return (
      <CenteredAuthLayout productName={productName} homeHref={homeHref} banner={banner}>
        <AuthCard>
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg border border-border bg-surface">
            <copy.icon className="size-5 text-muted-foreground" />
          </div>
          <AuthHeading eyebrow="Invitation" title={copy.title} description={copy.text} />
          <Button asChild size="lg" variant={session ? "outline" : "default"} className="h-10 w-full rounded-md">
            <Link href={session ? "/" : state === "accepted" && row ? `/login?email=${encodeURIComponent(row.inv.email)}` : "/login"}>
              {session ? "Go to your workspace" : "Sign in"}
            </Link>
          </Button>
        </AuthCard>
      </CenteredAuthLayout>
    )
  }

  const { inv, org, role, inviter } = row
  const inviterName = inviter?.name || inviter?.email || "A teammate"
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
          eyebrow="Invitation"
          title={`Join ${org.name}`}
          quiet={`on ${productName}.`}
          description={
            <>
              <span className="font-medium text-foreground">{inviterName}</span> invited{" "}
              <span className="font-medium break-words text-foreground">{inv.email}</span> to collaborate as{" "}
              <span className="inline-flex items-center rounded-sm border border-border bg-surface px-1.5 py-px font-mono text-[11px] uppercase tracking-wider text-foreground">
                {role.name}
              </span>
              . Shared inboxes, internal comments and assignments — all in one place.
            </>
          }
        />

        {!session ? (
          <>
            <Button asChild size="lg" className="h-10 w-full rounded-md">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(inv.email)}`}>
                Sign in to accept
              </Link>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              No password needed — we&apos;ll email a sign-in code to {inv.email}.
            </p>
          </>
        ) : matches ? (
          <InviteActions token={token} mode="accept" orgName={org.name} />
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
              You&apos;re signed in as <span className="font-medium break-words">{session.user.email}</span>, but this invitation is for{" "}
              <span className="font-medium break-words">{inv.email}</span>. Sign out on this device and continue with the invited address.
            </div>
            <InviteActions token={token} mode="switch" orgName={org.name} />
          </>
        )}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">Invitation valid until <LocalTime date={inv.expiresAt} format="date" />.</p>
      </AuthCard>
    </CenteredAuthLayout>
  )
}
