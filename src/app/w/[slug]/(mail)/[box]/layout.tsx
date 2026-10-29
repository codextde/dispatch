import { notFound, redirect } from "next/navigation"
import { requireOrgPage } from "@/server/authz"
import { boxKey, parseBox } from "@/lib/inbox/boxes"
import { MailPanes } from "@/components/inbox/mail-panes"

/** List pane + conversation pane for a mailbox (`/w/[slug]/[box]`). */
export default async function BoxLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; box: string }> }) {
  const { slug, box } = await params
  const parsed = parseBox(box)
  if (!parsed) notFound()
  if (parsed.kind === "static" && parsed.id === "chats") {
    const ctx = await requireOrgPage(slug)
    if (ctx.org.settings.features?.chat === false) redirect(`/w/${slug}/inbox`)
  }
  return <MailPanes box={boxKey(parsed)}>{children}</MailPanes>
}
