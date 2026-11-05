import type { Metadata } from "next"
import { requestLocale } from "@/server/locale"
import { requireSuperAdminPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { resolveHomePath } from "@/server/orgs"
import { AdminShell } from "@/components/admin/admin-shell"

export async function generateMetadata(): Promise<Metadata> {
  const it = (await requestLocale()) === "it"
  const name = it ? "Amministrazione istanza" : "Instance admin"
  return {
    title: { default: name, template: `%s · ${name}` },
    robots: { index: false, follow: false },
  }
}

/** Super admin panel shell. Non super admins get a 404 (the panel's existence isn't revealed). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireSuperAdminPage()
  const [general, branding, homePath] = await Promise.all([
    getSettings("general"),
    getSettings("branding"),
    resolveHomePath(user),
  ])
  return (
    <AdminShell
      instanceName={general.instanceName}
      productName={branding.productName || general.instanceName}
      homePath={homePath}
      user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
    >
      {children}
    </AdminShell>
  )
}
