import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { loadDevices, loadSignInActivity } from "@/server/workspace/queries/personal"
import { SettingsPage } from "@/components/settings/settings-ui"
import { SecurityPanel } from "@/components/settings/personal/security-panel"

export const metadata: Metadata = { title: "Security & devices" }

export default async function SecurityPage({ params }: PageProps<"/w/[slug]/settings/security">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const [devices, activity] = await Promise.all([
    loadDevices(ctx.user.id, ctx.session.id),
    loadSignInActivity({ id: ctx.user.id, email: ctx.user.email }),
  ])
  return (
    <SettingsPage
      eyebrow="Personal"
      title="Security"
      quiet="& devices"
      description="Review where you're signed in and recent sign-in activity on your account."
    >
      <SecurityPanel
        slug={ctx.org.slug}
        devices={devices}
        activity={activity.map(({ metadata: _m, ...e }) => {
          void _m
          return e
        })}
      />
    </SettingsPage>
  )
}
