import { requireOrgPage } from "@/server/authz"
import { getBootstrap } from "@/server/conversations/bootstrap"
import { loadScope } from "@/server/conversations/scope"
import { MailShell } from "@/components/inbox/mail-shell"

/** Mail area: sidebar + panes. The bootstrap is rendered here so the UI never starts empty. */
export default async function MailLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const bootstrap = await getBootstrap(ctx, await loadScope(ctx))
  return (
    <MailShell slug={slug} bootstrap={bootstrap}>
      {children}
    </MailShell>
  )
}
