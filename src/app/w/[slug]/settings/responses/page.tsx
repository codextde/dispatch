import type { Metadata } from "next"
import { can, requireOrgPage } from "@/server/authz"
import { loadResponsesPage } from "@/server/workspace/queries/responses"
import { ResponsesSettings } from "@/components/settings/responses/responses-settings"

export const metadata: Metadata = { title: "Canned responses" }

export default async function ResponsesPage({ params }: PageProps<"/w/[slug]/settings/responses">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const { responses, teams } = await loadResponsesPage(ctx)
  return (
    <ResponsesSettings slug={slug} responses={responses} teams={teams} canManageShared={can(ctx, "responses.manage")} />
  )
}
