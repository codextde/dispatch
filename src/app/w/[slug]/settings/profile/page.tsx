import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { ColorDot, SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-ui"
import { LeaveWorkspaceButton } from "@/components/settings/general/danger-zone"
import { formatDate } from "@/components/settings/format"
import { ProfileForm } from "@/components/settings/personal/profile-form"

export const metadata: Metadata = { title: "Profile" }

export default async function ProfilePage({ params }: PageProps<"/w/[slug]/settings/profile">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const general = await getSettings("general")
  const { user } = ctx
  return (
    <SettingsPage eyebrow="Personal" title="Profile" quiet="— how teammates see you." description="Update your photo, name and availability.">
      <ProfileForm
        slug={ctx.org.slug}
        workspaceTimezone={ctx.org.settings.timezone || general.defaultTimezone || "UTC"}
        profile={{
          name: user.name ?? "",
          email: user.email,
          title: ctx.membership.title ?? "",
          timezone: user.timezone,
          avatarUrl: user.avatarUrl,
          awayUntil: user.awayUntil?.toISOString() ?? null,
          awayMessage: user.awayMessage ?? "",
          away: Boolean(user.awayUntil && user.awayUntil > new Date()),
        }}
      />
      <SettingsSection title="Workspace membership">
        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              {ctx.org.name}
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <ColorDot color={ctx.role.color ?? "#64748b"} className="size-2" />
                {ctx.role.name}
              </span>
            </span>
          }
          description={`Member since ${formatDate(ctx.membership.createdAt)}.`}
        >
          <LeaveWorkspaceButton slug={ctx.org.slug} orgName={ctx.org.name} />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
