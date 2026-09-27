import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { getConnectOptions, listInboxes } from "@/server/workspace/queries/inboxes"
import { SettingsPage } from "@/components/settings/settings-ui"
import { ConnectInboxWizard } from "@/components/settings/inboxes/connect-wizard"
import { ConnectResultBanner } from "@/components/settings/inboxes/connect-banner"
import { InboxList } from "@/components/settings/inboxes/inbox-list"

export const metadata: Metadata = { title: "My inboxes" }

export default async function PersonalInboxesPage({ params, searchParams }: PageProps<"/w/[slug]/settings/personal-inboxes">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "inboxes.connect_personal")
  const sp = await searchParams
  const [inboxes, options] = await Promise.all([listInboxes(ctx, "personal"), getConnectOptions(ctx, "personal")])

  return (
    <SettingsPage
      eyebrow="Personal"
      title="My inboxes"
      quiet="private to you"
      description={`Connect your own mailboxes to ${ctx.org.name}. Their conversations are only visible to you — you can still assign, comment and share individual threads.`}
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
