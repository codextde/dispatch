import type { MetadataRoute } from "next"
import { competitors } from "@/content/marketing/competitors"
import { features } from "@/content/marketing/features"
import { useCases } from "@/content/marketing/use-cases"
import { getAppUrl } from "@/server/env"
import { getSettings } from "@/server/settings"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl()
  const general = await getSettings("general").catch(() => null)
  if (general?.marketingSite === false) return []

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
    entry("/self-hosting", 0.8),
    entry("/security", 0.6),
    entry("/open-source", 0.6),
    entry("/changelog", 0.5, "weekly"),
    entry("/about", 0.4),
    entry("/legal/imprint", 0.1, "yearly"),
    entry("/legal/privacy", 0.1, "yearly"),
    entry("/legal/terms", 0.1, "yearly"),
  ]
}
