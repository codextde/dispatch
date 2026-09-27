import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { loadInboxEditor } from "@/server/workspace/queries/inboxes"
import { InboxEditor } from "@/components/settings/inboxes/inbox-editor"

export const metadata: Metadata = { title: "Inbox settings" }

export default async function InboxSettingsPage({ params }: PageProps<"/w/[slug]/settings/inboxes/[id]">) {
  const { slug, id } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "inboxes.manage")
  const data = await loadInboxEditor(ctx, id, "shared")
  // Deleted (or never existed): back to the list instead of a 404
  if (!data) redirect(`/w/${slug}/settings/inboxes`)
  return <InboxEditor {...data} />
}
