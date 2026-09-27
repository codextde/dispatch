import { redirect } from "next/navigation"

export default async function SettingsIndex({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params
  redirect(`/w/${slug}/settings/profile`)
}
