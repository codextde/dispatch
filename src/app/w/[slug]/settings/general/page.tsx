import type { Metadata } from "next"
import { isOwner, requirePagePermission, requireOrgPage } from "@/server/authz"
import { getSettings, readSecret } from "@/server/settings"
import { maskSecret } from "@/server/crypto"
import { getAppUrl } from "@/server/env"
import { RESERVED_SLUGS } from "@/server/orgs"
import { hasDemoData } from "@/server/demo"
import { hasLiveSubscription } from "@/server/billing"
import { listRoleOptions } from "@/server/workspace/queries/common"
import { PUBLIC_EMAIL_DOMAINS, verifiedAdminDomains } from "@/server/workspace/services/general"
import { SettingsPage } from "@/components/settings/settings-ui"
import { IdentitySection } from "@/components/settings/general/identity-section"
import { BusinessHoursSection, ConversationSection } from "@/components/settings/general/behaviour-sections"
import { AccessSection } from "@/components/settings/general/access-section"
import { AiSection, type AiMode } from "@/components/settings/general/ai-section"
import { DangerZone, DemoDataSection } from "@/components/settings/general/danger-zone"

export const metadata: Metadata = { title: "General" }

export default async function GeneralSettingsPage({ params }: PageProps<"/w/[slug]/settings/general">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "settings.manage")

  const [general, instanceAi, roles, demo, verifiedDomains] = await Promise.all([
    getSettings("general"),
    getSettings("ai"),
    listRoleOptions(ctx.org.id),
    hasDemoData(ctx.org.id),
    verifiedAdminDomains(ctx.org.id),
  ])
  const s = ctx.org.settings
  const timezone = s.timezone || general.defaultTimezone || "UTC"
  const ai = s.ai ?? {}
  const aiMode: AiMode = ai.enabled === false ? "off" : ai.enabled && instanceAi.allowOrgKeys ? "custom" : "instance"
  const instanceAvailable =
    instanceAi.enabled && (Boolean(readSecret(instanceAi.apiKeyEnc)) || (instanceAi.provider === "openai" && Boolean(instanceAi.baseUrl)))
  const memberRole = roles.find((r) => r.key === "member")
  const selectableRoles = roles.filter((r) => r.key !== "owner")
  const defaultRoleId = selectableRoles.some((r) => r.id === s.defaultRoleId) ? s.defaultRoleId! : (memberRole?.id ?? selectableRoles[0]?.id ?? "")

  return (
    <SettingsPage eyebrow="Workspace" title="General" quiet="settings" description={`Manage ${ctx.org.name}'s profile, defaults and access.`}>
      <IdentitySection
        slug={ctx.org.slug}
        name={ctx.org.name}
        timezone={timezone}
        logoUrl={ctx.org.logoUrl}
        appUrl={getAppUrl()}
        reservedSlugs={[...RESERVED_SLUGS]}
      />
      <ConversationSection
        slug={ctx.org.slug}
        initial={{
          reopenOnReply: s.reopenOnReply !== false,
          closeOnReply: Boolean(s.closeOnReply),
          undoSendSeconds: typeof s.undoSendSeconds === "number" ? s.undoSendSeconds : 5,
        }}
      />
      <BusinessHoursSection
        slug={ctx.org.slug}
        timezone={timezone}
        initial={{
          enabled: Boolean(s.businessHours?.enabled),
          days: s.businessHours?.days ?? [1, 2, 3, 4, 5],
          start: s.businessHours?.start ?? "09:00",
          end: s.businessHours?.end ?? "17:00",
        }}
      />
      <AccessSection
        slug={ctx.org.slug}
        roles={selectableRoles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
        publicDomains={[...PUBLIC_EMAIL_DOMAINS]}
        verifiedDomains={[...verifiedDomains]}
        approvalRequired={general.mode === "saas"}
        initial={{
          allowedDomains: s.allowedDomains ?? [],
          autoJoinDomains: Boolean(s.autoJoinDomains),
          requireDomainForInvites: Boolean(s.requireDomainForInvites),
          defaultRoleId,
        }}
      />
      <AiSection
        slug={ctx.org.slug}
        instance={{ allowOrgKeys: instanceAi.allowOrgKeys, available: instanceAvailable, provider: instanceAi.provider, model: instanceAi.model }}
        initial={{
          mode: aiMode,
          provider: ai.provider ?? "anthropic",
          model: ai.model ?? "",
          baseUrl: ai.baseUrl ?? "",
          keyPreview: maskSecret(readSecret(ai.apiKeyEnc)),
        }}
      />
      <DemoDataSection slug={ctx.org.slug} hasDemo={demo} />
      <DangerZone slug={ctx.org.slug} orgName={ctx.org.name} isOwner={isOwner(ctx)} hasSubscription={hasLiveSubscription(ctx.org)} />
    </SettingsPage>
  )
}
