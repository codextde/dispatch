import type { Metadata } from "next"
import { requireSuperAdminPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { redactForAdmin } from "@/server/admin/settings"
import { getAppUrl } from "@/server/env"
import { AdminPageHeader } from "@/components/admin/ui"
import { BillingSettingsForm } from "@/components/admin/settings/billing-form"
import { SECTION_HEADERS } from "@/app/admin/settings/sections"

export const metadata: Metadata = { title: "Billing · Settings" }

/** Billing lives in its own route (not ./[section]) so only this page loads the Stripe integration. */
export default async function AdminBillingSettingsPage() {
  await requireSuperAdminPage()
  const [billing, general] = await Promise.all([getSettings("billing"), getSettings("general")])
  const header = SECTION_HEADERS.billing
  return (
    <>
      <AdminPageHeader eyebrow="Settings" title={header.title} quiet={header.quiet} description={header.description} />
      <BillingSettingsForm initial={redactForAdmin(billing)} mode={general.mode} webhookUrl={`${getAppUrl()}/api/stripe/webhook`} />
    </>
  )
}
