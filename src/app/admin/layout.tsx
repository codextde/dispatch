import type { Metadata } from "next"
import { requireSuperAdminPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { resolveHomePath } from "@/server/orgs"
import { AdminShell } from "@/components/admin/admin-shell"

export const metadata: Metadata = {
  title: { default: "Instance admin", template: "%s · Instance admin" },
  robots: { index: false, follow: false },
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
