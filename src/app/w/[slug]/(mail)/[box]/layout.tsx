import { notFound } from "next/navigation"
import { boxKey, parseBox } from "@/lib/inbox/boxes"
import { MailPanes } from "@/components/inbox/mail-panes"

/** List pane + conversation pane for a mailbox (`/w/[slug]/[box]`). */
export default async function BoxLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string; box: string }> }) {
  const { box } = await params
  const parsed = parseBox(box)
  if (!parsed) notFound()
  return <MailPanes box={boxKey(parsed)}>{children}</MailPanes>
}
