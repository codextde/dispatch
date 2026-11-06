import { Suspense } from "react"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { pageTitle } from "@/server/locale"
import { CalendarView } from "@/components/calendar/calendar-view"

export async function generateMetadata() {
  return { title: await pageTitle("Calendar", "Calendario") }
}

export default async function CalendarPage({ params }: PageProps<"/w/[slug]/calendar">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "calendar.use")
  return <Suspense><CalendarView /></Suspense>
}
