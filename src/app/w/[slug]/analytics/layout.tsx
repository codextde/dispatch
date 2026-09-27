import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { AnalyticsTopBar } from "@/components/analytics/analytics-top-bar"

export const metadata: Metadata = { title: "Analytics" }

export default async function AnalyticsLayout({ children, params }: LayoutProps<"/w/[slug]/analytics">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "analytics.view")
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AnalyticsTopBar />
      <main id="analytics-main" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
