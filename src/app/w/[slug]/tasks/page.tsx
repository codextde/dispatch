import { pageTitle } from "@/server/locale"
import type { Metadata } from "next"
import { Suspense } from "react"
import { requireOrgPage } from "@/server/authz"
import { TasksView } from "@/components/tasks/tasks-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Tasks", "Attività") }
}

export default async function TasksPage({ params }: PageProps<"/w/[slug]/tasks">) {
  const { slug } = await params
  await requireOrgPage(slug)
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  )
}
