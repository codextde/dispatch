import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { loadRolesPage } from "@/server/workspace/queries/roles"
import { RolesSettings } from "@/components/settings/roles/roles-settings"

export const metadata: Metadata = { title: "Roles & permissions" }

export default async function RolesPage({ params }: PageProps<"/w/[slug]/settings/roles">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "roles.manage")
  const data = await loadRolesPage(ctx)
  return <RolesSettings slug={ctx.org.slug} data={data} />
}
