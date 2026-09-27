import type { Viewport } from "next"
import { getSettings } from "@/server/settings"
import { SiteChrome } from "@/components/marketing/site-chrome"
import "@/components/marketing/marketing.css"

export const viewport: Viewport = { themeColor: "#FAF9F5" }

/**
 * Imprint, privacy policy and terms. Always public (the sign-in page links
 * here), with the full site chrome when the marketing site is on and a
 * minimal header otherwise.
 */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const general = await getSettings("general")
  return <SiteChrome variant={general.marketingSite === false ? "minimal" : "full"}>{children}</SiteChrome>
}
