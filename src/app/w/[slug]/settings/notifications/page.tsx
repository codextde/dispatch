import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { SettingsPage } from "@/components/settings/settings-ui"
import { NotificationsForm } from "@/components/settings/personal/notifications-form"

export const metadata: Metadata = { title: "Notifiche" }

export default async function NotificationsPage({ params }: PageProps<"/w/[slug]/settings/notifications">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const n = ctx.user.preferences?.notifications ?? {}
  return (
    <SettingsPage
      eyebrow={ctx.user.locale === "it" ? "Personale" : "Personal"}
      title={ctx.user.locale === "it" ? "Notifiche" : "Notifications"}
      quiet={ctx.user.locale === "it" ? "— resta aggiornato, senza rumore." : "— stay in the loop, not in the noise."}
      description={ctx.user.locale === "it" ? "Scegli come Dispatch ti avvisa di menzioni, assegnazioni e nuovi messaggi." : "Choose how Dispatch tells you about mentions, assignments and new messages."}
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
