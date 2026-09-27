import { notFound } from "next/navigation"
import { requireOrgPage } from "@/server/authz"
import { loadRuleOptions } from "@/server/workspace/queries/rules"
import { canUseScope } from "@/server/workspace/services/rules"
import { RuleBuilder } from "@/components/settings/rules/rule-builder"
import type { RuleScope } from "@/components/settings/rules/definitions"

export const metadata = { title: "New rule" }

export default async function NewRulePage({ params, searchParams }: PageProps<"/w/[slug]/settings/rules/new">) {
  const { slug } = await params
  const { scope: scopeParam } = await searchParams
  const ctx = await requireOrgPage(slug)
  const requested: RuleScope | null = scopeParam === "personal" ? "personal" : scopeParam === "workspace" ? "workspace" : null
  const scope: RuleScope | undefined = requested
    ? canUseScope(ctx, requested)
      ? requested
      : undefined
    : canUseScope(ctx, "workspace")
      ? "workspace"
      : canUseScope(ctx, "personal")
        ? "personal"
        : undefined
  if (!scope) notFound()

  const options = await loadRuleOptions(ctx, scope)
  return (
    <RuleBuilder
      slug={slug}
      scope={scope}
      rule={null}
      options={options}
      allowHttpLocalhost={process.env.NODE_ENV !== "production"}
    />
  )
}
