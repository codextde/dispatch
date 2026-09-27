import type { Viewport } from "next"
import { redirect } from "next/navigation"
import { getSettings, isSetupComplete } from "@/server/settings"
import { SiteChrome } from "@/components/marketing/site-chrome"
import { APP_ENTRY } from "@/content/marketing/site"
import "@/components/marketing/marketing.css"

export const viewport: Viewport = { themeColor: "#FAF9F5" }

/**
 * Public marketing site. Instances can switch it off in Admin → General
 * (`marketingSite`), in which case every marketing URL forwards to the app.
 * Legal pages live in the (legal) group so they stay reachable either way.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // A fresh instance goes straight to the first-run wizard
  if (!(await isSetupComplete())) redirect("/setup")
  const general = await getSettings("general")
  if (general.marketingSite === false) redirect(APP_ENTRY)
  return <SiteChrome variant="full">{children}</SiteChrome>
}
