import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { SettingsPage } from "@/components/settings/settings-ui"
import { NotificationsForm } from "@/components/settings/personal/notifications-form"

export const metadata: Metadata = { title: "Notifications" }

export default async function NotificationsPage({ params }: PageProps<"/w/[slug]/settings/notifications">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const n = ctx.user.preferences?.notifications ?? {}
  return (
    <SettingsPage
      eyebrow="Personal"
      title="Notifications"
      quiet="— stay in the loop, not in the noise."
      description="Choose how Dispatch tells you about mentions, assignments and new messages."
    >
      <NotificationsForm
        slug={ctx.org.slug}
        userEmail={ctx.user.email}
        initial={{
          email: n.email !== false,
          desktop: n.desktop === true,
          mentions: n.mentions !== false,
          assignments: n.assignments !== false,
          newMessages: n.newMessages ?? "assigned",
        }}
      />
    </SettingsPage>
  )
}
