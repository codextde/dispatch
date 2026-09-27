import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { loadOrgContext, requireOrgPage } from "@/server/authz"
import { loadRuleOptions } from "@/server/workspace/queries/rules"
import { canUseScope, ruleScope } from "@/server/workspace/services/rules"
import { RuleBuilder } from "@/components/settings/rules/rule-builder"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadRule(slug: string, id: string) {
  const ctx = await loadOrgContext(slug)
  if (!ctx || !UUID_RE.test(id)) return null
  const [rule] = await db
    .select()
    .from(schema.rules)
    .where(and(eq(schema.rules.id, id), eq(schema.rules.orgId, ctx.org.id)))
    .limit(1)
  if (!rule) return null
  if (rule.ownerUserId && rule.ownerUserId !== ctx.user.id) return null
  if (!canUseScope(ctx, ruleScope(rule))) return null
  return rule
}

export async function generateMetadata({ params }: PageProps<"/w/[slug]/settings/rules/[id]">): Promise<Metadata> {
  const { slug, id } = await params
  const rule = await loadRule(slug, id)
  return { title: rule ? rule.name : "Rule" }
}

export default async function EditRulePage({ params }: PageProps<"/w/[slug]/settings/rules/[id]">) {
  const { slug, id } = await params
  const ctx = await requireOrgPage(slug)
  const rule = await loadRule(slug, id)
  if (!rule) notFound()
  const scope = ruleScope(rule)
  const options = await loadRuleOptions(ctx, scope)

  return (
    <RuleBuilder
      slug={slug}
      scope={scope}
      rule={{
        id: rule.id,
        name: rule.name,
        description: rule.description,
        trigger: rule.trigger === "outgoing" ? "outgoing" : "incoming",
        enabled: rule.enabled,
        accountIds: rule.accountIds,
        conditions: rule.conditions,
        actions: rule.actions,
        stopProcessing: rule.stopProcessing,
        runCount: rule.runCount,
        lastRunAt: rule.lastRunAt,
        createdAt: rule.createdAt,
      }}
      options={options}
      allowHttpLocalhost={process.env.NODE_ENV !== "production"}
    />
  )
}
