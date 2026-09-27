import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { can, requireOrgPage, requirePagePermission } from "@/server/authz"
import { db, schema } from "@/server/db"
import { getConnectOptions, listInboxes } from "@/server/workspace/queries/inboxes"
import { SettingsPage } from "@/components/settings/settings-ui"
import { ConnectInboxWizard } from "@/components/settings/inboxes/connect-wizard"
import { ConnectResultBanner } from "@/components/settings/inboxes/connect-banner"
import { InboxList } from "@/components/settings/inboxes/inbox-list"

export const metadata: Metadata = { title: "Inboxes" }

export default async function InboxesPage({ params, searchParams }: PageProps<"/w/[slug]/settings/inboxes">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const sp = await searchParams

  // The OAuth connect flow always returns here; personal inboxes belong on "My inboxes"
  const connected = typeof sp.connected === "string" ? sp.connected : undefined
  const oauthResult = connected !== undefined || typeof sp.error === "string"
  if (oauthResult) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString()
    const personal =
      connected && /^[0-9a-f-]{36}$/i.test(connected)
        ? await db.query.accounts.findFirst({
            where: and(eq(schema.accounts.id, connected), eq(schema.accounts.orgId, ctx.org.id), eq(schema.accounts.ownerUserId, ctx.user.id)),
            columns: { id: true },
          })
        : undefined
    if (personal || (!can(ctx, "inboxes.manage") && can(ctx, "inboxes.connect_personal"))) {
      redirect(`/w/${ctx.org.slug}/settings/personal-inboxes?${qs}`)
    }
  }
  requirePagePermission(ctx, "inboxes.manage")
  const [inboxes, options] = await Promise.all([listInboxes(ctx, "shared"), getConnectOptions(ctx, "shared")])

  return (
    <SettingsPage
      eyebrow="Workspace"
      title="Shared inboxes"
      quiet="your team works from"
      description="Connect team mailboxes over IMAP/SMTP or with Google and Microsoft, and decide who can see and reply to each one."
      actions={inboxes.length > 0 ? <ConnectInboxWizard options={options} /> : undefined}
    >
      <ConnectResultBanner
        connected={typeof sp.connected === "string" ? sp.connected : undefined}
        error={typeof sp.error === "string" ? sp.error : undefined}
      />
      <InboxList inboxes={inboxes} options={options} />
    </SettingsPage>
  )
}
