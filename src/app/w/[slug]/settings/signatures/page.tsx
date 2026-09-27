import type { Metadata } from "next"
import { can, requireOrgPage } from "@/server/authz"
import { loadSignaturesPage } from "@/server/workspace/queries/signatures"
import { SignaturesSettings } from "@/components/settings/signatures/signatures-settings"

export const metadata: Metadata = { title: "Signatures" }

export default async function SignaturesPage({ params }: PageProps<"/w/[slug]/settings/signatures">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const { signatures, accounts, preview } = await loadSignaturesPage(ctx)
  return (
    <SignaturesSettings
      slug={slug}
      signatures={signatures}
      accounts={accounts}
      previewUser={preview}
      canManageWorkspace={can(ctx, "signatures.manage")}
    />
  )
}
