import type { Metadata } from "next"
import { Suspense } from "react"
import { requireOrgPage } from "@/server/authz"
import { TasksView } from "@/components/tasks/tasks-view"

export const metadata: Metadata = { title: "Tasks" }

export default async function TasksPage({ params }: PageProps<"/w/[slug]/tasks">) {
  const { slug } = await params
  await requireOrgPage(slug)
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  )
}
