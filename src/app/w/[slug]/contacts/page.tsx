import type { Metadata } from "next"
import { Suspense } from "react"
import { requireOrgPage } from "@/server/authz"
import { ContactsView } from "@/components/contacts/contacts-view"

export const metadata: Metadata = { title: "Contacts" }

export default async function ContactsPage({ params }: PageProps<"/w/[slug]/contacts">) {
  const { slug } = await params
  await requireOrgPage(slug)
  return (
    <Suspense>
      <ContactsView />
    </Suspense>
  )
}
