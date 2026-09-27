import { redirect } from "next/navigation"
import { requireSuperAdminPage } from "@/server/authz"

export default async function AdminSettingsIndex() {
  await requireSuperAdminPage()
  redirect("/admin/settings/general")
}
