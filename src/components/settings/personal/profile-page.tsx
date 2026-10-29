"use client"

import { ColorDot, SettingsPage, SettingsSection, SettingsRow } from "@/components/settings/settings-ui"
import { LeaveWorkspaceButton } from "@/components/settings/general/danger-zone"
import { LocalTime } from "@/components/app/local-time"
import { ProfileForm } from "@/components/settings/personal/profile-form"
import { localizeRoleName, useI18n } from "@/lib/i18n"

type Profile = {
  name: string
  email: string
  title: string
  timezone: string | null
  avatarUrl: string | null
  awayUntil: string | null
  awayMessage: string
  away: boolean
}

export function ProfilePageContent({
  slug,
  workspaceName,
  workspaceTimezone,
  profile,
  role,
  memberSince,
}: {
  slug: string
  workspaceName: string
  workspaceTimezone: string
  profile: Profile
  role: { key: string | null; name: string; color: string | null }
  memberSince: string
}) {
  const { locale, t } = useI18n()
  return (
    <SettingsPage
      eyebrow={t("profilePersonal")}
      title={t("profile")}
      quiet={t("profileQuiet")}
      description={t("profileDescription")}
    >
      <ProfileForm slug={slug} workspaceTimezone={workspaceTimezone} profile={profile} />
      <SettingsSection title={t("profileWorkspaceMembership")}>
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              {workspaceName}
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <ColorDot color={role.color ?? "#64748b"} className="size-2" />
                {localizeRoleName(role.key, role.name, locale)}
              </span>
            </span>
          }
          description={
            <>
              {t("profileMemberSince")} <LocalTime date={memberSince} format="date" />.
            </>
          }
        >
          <LeaveWorkspaceButton slug={slug} orgName={workspaceName} />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
