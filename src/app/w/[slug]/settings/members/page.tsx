import { pageTitle } from "@/server/locale"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { can, requireOrgPage } from "@/server/authz"
import { loadMembersPage } from "@/server/workspace/queries/members"
import { MembersSettings } from "@/components/settings/members/members-settings"

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Members", "Membri") }
}

export default async function MembersPage({ params }: PageProps<"/w/[slug]/settings/members">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  if (!can(ctx, "members.manage") && !can(ctx, "members.invite")) notFound()
  const data = await loadMembersPage(ctx)
  return <MembersSettings slug={ctx.org.slug} orgName={ctx.org.name} data={data} />
}
