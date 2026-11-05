import { pageTitle } from "@/server/locale"
import type { Metadata } from "next"
import { can, requireOrgPage } from "@/server/authz"
import { loadResponsesPage } from "@/server/workspace/queries/responses"
import { ResponsesSettings } from "@/components/settings/responses/responses-settings"

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Canned responses", "Risposte predefinite") }
}

export default async function ResponsesPage({ params }: PageProps<"/w/[slug]/settings/responses">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const { responses, teams } = await loadResponsesPage(ctx)
  return (
    <ResponsesSettings slug={slug} responses={responses} teams={teams} canManageShared={can(ctx, "responses.manage")} />
  )
}
