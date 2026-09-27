import type { MetadataRoute } from "next"
import { competitors } from "@/content/marketing/competitors"
import { features } from "@/content/marketing/features"
import { detailedIntegrations } from "@/content/marketing/integrations"
import { useCases } from "@/content/marketing/use-cases"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"

/** Reflects instance settings (domain, marketing site on/off), so it is rendered per request. */
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl()
  const [general, legal] = await Promise.all([
    getSettings("general").catch(() => null),
    getSettings("legal").catch(() => null),
  ])
  const legalPages = (["imprint", "privacy", "terms"] as const).filter((k) => legal?.[k]?.trim())
  if (general?.marketingSite === false) return legalPages.map((k) => ({ url: `${base}/legal/${k}` }))

  const lastModified = new Date()
  const entry = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly" = "monthly") => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  })

  return [
    entry("/", 1, "weekly"),
    entry("/pricing", 0.9, "weekly"),
    entry("/features", 0.9),
    ...features.map((f) => entry(`/features/${f.slug}`, 0.7)),
    entry("/use-cases", 0.7),
    ...useCases.map((u) => entry(`/use-cases/${u.slug}`, 0.6)),
    entry("/compare", 0.7),
    ...competitors.map((c) => entry(`/compare/${c.slug}`, 0.7)),
    entry("/integrations", 0.8),
    ...detailedIntegrations.map((i) => entry(`/integrations/${i.id}`, 0.6)),
    entry("/self-hosting", 0.8),
    entry("/docs", 0.7),
    entry("/download", 0.6),
    entry("/security", 0.6),
    entry("/open-source", 0.6),
    entry("/changelog", 0.5, "weekly"),
    entry("/about", 0.4),
    ...legalPages.map((k) => entry(`/legal/${k}`, 0.1, "yearly")),
  ]
}
