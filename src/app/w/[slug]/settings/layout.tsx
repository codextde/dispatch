import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { SettingsShell } from "@/components/settings/settings-shell"

export const metadata: Metadata = { title: { template: "%s · Settings", default: "Settings" } }

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[slug]/settings">) {
  const { slug } = await params
  await requireOrgPage(slug)
  return <SettingsShell>{children}</SettingsShell>
}
