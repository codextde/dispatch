import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { getCurrentUser } from "@/server/auth/session"
import { getSettings } from "@/server/settings"
import { APP_ENTRY } from "@/content/marketing/site"
import { AnnouncementBar } from "./announcement-bar"
import { FloatingCta } from "./floating-cta"
import { formatStars, getGitHubStars } from "./lib/github"
import { getMarketingNav } from "./nav"
import { buttonClasses } from "./primitives"
import { SiteFooter } from "./site-footer"
import { SiteHeader } from "./site-header"

/**
 * Page chrome for public pages. `full` is the marketing site (header with mega
 * menus, footer, floating CTA); `minimal` is used for legal pages on instances
 * that switched the marketing site off.
 */
export async function SiteChrome({ variant, children }: { variant: "full" | "minimal"; children: React.ReactNode }) {
  const general = await getSettings("general")
  // Only the hosted SaaS site shows the live star count, so private instances never call GitHub.
  const [user, stars] = await Promise.all([
    getCurrentUser().catch(() => null),
    variant === "full" && general.mode === "saas" ? getGitHubStars() : Promise.resolve(null),
  ])
  const starLabel = formatStars(stars)
  const signedIn = Boolean(user)

  return (
    <div className="mk-light flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only z-50 rounded-[4px] bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {variant === "full" ? (
        <>
          <AnnouncementBar stars={starLabel} />
          <SiteHeader {...getMarketingNav()} signedIn={signedIn} stars={starLabel} />
        </>
      ) : (
        <header className="border-b border-border">
          <div className="rails flex h-16 items-center justify-between px-5 sm:px-8 lg:px-6">
            <Link href={APP_ENTRY} aria-label={`${general.instanceName} sign in`}>
              <Logo name={general.instanceName || "Dispatch"} />
            </Link>
            <Link href={APP_ENTRY} className={buttonClasses({ size: "sm" })}>
              {signedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </header>
      )}
      <main id="main" className="flex-1">
        {children}
      </main>
      {variant === "full" ? (
        <>
          <SiteFooter stars={starLabel} />
          <FloatingCta signedIn={signedIn} stars={starLabel} />
        </>
      ) : (
        <footer id="site-footer" className="border-t border-border">
          <div className="rails flex flex-col gap-3 px-5 py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
            <nav aria-label="Legal" className="flex gap-4">
              <Link href="/legal/imprint" className="hover:text-foreground">
                Imprint
              </Link>
              <Link href="/legal/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/legal/terms" className="hover:text-foreground">
                Terms
              </Link>
            </nav>
            <p>Powered by Dispatch, open source under the AGPL-3.0.</p>
          </div>
        </footer>
      )}
    </div>
  )
}
