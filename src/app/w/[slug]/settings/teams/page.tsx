import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { loadTeamsPage } from "@/server/workspace/queries/teams"
import { TeamsSettings } from "@/components/settings/teams/teams-settings"

export const metadata: Metadata = { title: "Teams" }

export default async function TeamsPage({ params }: PageProps<"/w/[slug]/settings/teams">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "teams.manage")
  const data = await loadTeamsPage(ctx)
  return <TeamsSettings slug={ctx.org.slug} data={data} />
}
