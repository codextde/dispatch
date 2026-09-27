import { notFound } from "next/navigation"
import { can, requireOrgPage } from "@/server/authz"
import { listRules, loadRuleLookup } from "@/server/workspace/queries/rules"
import { listRuleTemplates } from "@/server/workspace/services/rules"
import { SettingsPage } from "@/components/settings/settings-ui"
import { RulesManager, type RuleScopeData } from "@/components/settings/rules/rules-manager"
import type { RuleScope } from "@/components/settings/rules/definitions"

export const metadata = { title: "Rules" }

export default async function RulesPage({ params, searchParams }: PageProps<"/w/[slug]/settings/rules">) {
  const { slug } = await params
  const { scope: scopeParam } = await searchParams
  const ctx = await requireOrgPage(slug)
  const scopes: RuleScope[] = []
  if (can(ctx, "rules.manage")) scopes.push("workspace")
  if (can(ctx, "inboxes.connect_personal")) scopes.push("personal")
  if (!scopes.length) notFound()

  const [lookup, ...data] = await Promise.all([
    loadRuleLookup(ctx),
    ...scopes.map(
      async (scope): Promise<RuleScopeData> => ({
        scope,
        rules: await listRules(ctx, scope),
        templates: await listRuleTemplates(ctx, scope),
      })
    ),
  ])

  return (
    <SettingsPage
      title="Rules"
      quiet="that work while you don’t."
      description="Label, assign, reply to and route emails automatically as they arrive or go out. Rules run from top to bottom."
    >
      <RulesManager
        slug={slug}
        scopes={data as RuleScopeData[]}
        lookup={lookup}
        defaultScope={scopeParam === "personal" ? "personal" : "workspace"}
      />
    </SettingsPage>
  )
}
