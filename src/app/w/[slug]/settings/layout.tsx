import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { requestLocale } from "@/server/locale"
import { SettingsShell } from "@/components/settings/settings-shell"

export async function generateMetadata(): Promise<Metadata> {
  const it = (await requestLocale()) === "it"
  return { title: { template: it ? "%s · Impostazioni" : "%s · Settings", default: it ? "Impostazioni" : "Settings" } }
}

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[slug]/settings">) {
  const { slug } = await params
  await requireOrgPage(slug)
  return <SettingsShell>{children}</SettingsShell>
}
