import type { Metadata } from "next"
import { can, requireOrgPage } from "@/server/authz"
import { loadLabelsPage } from "@/server/workspace/queries/labels"
import { LabelsSettings } from "@/components/settings/labels/labels-settings"

export const metadata: Metadata = { title: "Labels" }

export default async function LabelsPage({ params }: PageProps<"/w/[slug]/settings/labels">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const data = await loadLabelsPage(ctx)
  return <LabelsSettings slug={slug} orgName={ctx.org.name} initial={data} canManageShared={can(ctx, "labels.manage")} />
}
