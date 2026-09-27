import { redirect } from "next/navigation"
import { getSettings } from "@/server/settings"
import { getCurrentUser } from "@/server/auth/session"
import { AnnouncementBar } from "@/components/marketing/announcement-bar"
import { FloatingCta } from "@/components/marketing/floating-cta"
import { getMarketingNav } from "@/components/marketing/nav"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"
import { formatStars, getGitHubStars } from "@/components/marketing/lib/github"
import { APP_ENTRY } from "@/content/marketing/site"
import "@/components/marketing/marketing.css"

/**
 * Public marketing site. Instances can switch it off in Admin → General
 * (`marketingSite`), in which case every marketing URL forwards to the app.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const general = await getSettings("general")
  if (general.marketingSite === false) redirect(APP_ENTRY)

  const [user, stars] = await Promise.all([getCurrentUser().catch(() => null), getGitHubStars()])
  const starLabel = formatStars(stars)
  const nav = getMarketingNav()

  return (
    <div className="mk-light flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only z-50 rounded-[4px] bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AnnouncementBar stars={starLabel} />
      <SiteHeader groups={nav.groups} pricing={nav.pricing} signedIn={Boolean(user)} stars={starLabel} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter stars={starLabel} />
      <FloatingCta signedIn={Boolean(user)} stars={starLabel} />
    </div>
  )
}
