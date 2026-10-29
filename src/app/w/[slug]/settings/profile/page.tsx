import type { Metadata } from "next"
import { cookies } from "next/headers"
import { requireOrgPage } from "@/server/authz"
import { getCurrentSession } from "@/server/auth/session"
import { getSettings } from "@/server/settings"
import { ProfilePageContent } from "@/components/settings/personal/profile-page"

export async function generateMetadata(): Promise<Metadata> {
  const session = await getCurrentSession()
  const preferredLocale = (await cookies()).get("dispatch-locale")?.value
  const locale = session?.user.locale === "it" || (!session && preferredLocale === "it") ? "it" : "en"
  return { title: locale === "it" ? "Profilo" : "Profile" }
}

export default async function ProfilePage({ params }: PageProps<"/w/[slug]/settings/profile">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const general = await getSettings("general")
  const { user } = ctx
  return (
    <ProfilePageContent
      slug={ctx.org.slug}
      workspaceName={ctx.org.name}
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
      role={{ key: ctx.role.key, name: ctx.role.name, color: ctx.role.color }}
      memberSince={ctx.membership.createdAt.toISOString()}
    />
  )
}
