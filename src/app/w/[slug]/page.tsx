import { redirect } from "next/navigation"

export default async function WorkspaceIndex({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params
  redirect(`/w/${slug}/inbox`)
}
