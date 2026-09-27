import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { loadInboxEditor } from "@/server/workspace/queries/inboxes"
import { InboxEditor } from "@/components/settings/inboxes/inbox-editor"

export const metadata: Metadata = { title: "Inbox settings" }

export default async function PersonalInboxSettingsPage({ params }: PageProps<"/w/[slug]/settings/personal-inboxes/[id]">) {
  const { slug, id } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "inboxes.connect_personal")
  const data = await loadInboxEditor(ctx, id, "personal")
  if (!data) redirect(`/w/${slug}/settings/personal-inboxes`)
  return <InboxEditor {...data} />
}
