import type { MetadataRoute } from "next"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"

/** Reflects instance settings (domain, marketing site on/off), so it is rendered per request. */
export const dynamic = "force-dynamic"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = getAppUrl()
  const general = await getSettings("general").catch(() => null)
  const privateApp = ["/w/", "/admin", "/api/", "/auth/", "/onboarding", "/invite", "/setup"]
  return {
    rules:
      general?.marketingSite === false
        ? // No public site on this instance: keep everything out of search engines.
          { userAgent: "*", disallow: "/" }
        : { userAgent: "*", allow: "/", disallow: privateApp },
    sitemap: `${base}/sitemap.xml`,
  }
}
