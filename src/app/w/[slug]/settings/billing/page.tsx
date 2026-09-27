import type { Metadata } from "next"
import { requireOrgPage, requirePagePermission } from "@/server/authz"
import { BILLING_ERRORS, type BillingErrorCode } from "@/server/billing"
import { loadBillingOverview } from "@/server/workspace/queries/billing"
import { SettingsPage } from "@/components/settings/settings-ui"
import { BillingView } from "@/components/settings/billing/billing-view"

export const metadata: Metadata = { title: "Billing" }

export default async function BillingPage({ params, searchParams }: PageProps<"/w/[slug]/settings/billing">) {
  const { slug } = await params
  const sp = await searchParams
  const ctx = await requireOrgPage(slug)
  requirePagePermission(ctx, "billing.manage")
  const overview = await loadBillingOverview(ctx)

  // Only known error codes are rendered — never free text from the URL
  const code = typeof sp.error === "string" ? sp.error : null
  const error = code && Object.hasOwn(BILLING_ERRORS, code) ? BILLING_ERRORS[code as BillingErrorCode] : code ? "Something went wrong with billing. Please try again." : null
  const checkout = sp.checkout === "success" || sp.checkout === "canceled" ? sp.checkout : null
  const now = new Date().getTime()

  return (
    <SettingsPage
      eyebrow="Administration"
      title="Billing"
      quiet="& plan."
      description={
        overview.mode === "self_hosted"
          ? "Plan information for this workspace."
          : "Manage your subscription, payment method and invoices."
      }
    >
      <BillingView slug={ctx.org.slug} overview={overview} error={error} checkout={checkout} now={now} />
    </SettingsPage>
  )
}
