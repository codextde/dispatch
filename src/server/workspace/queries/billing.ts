import "server-only"
import { getSettings, readSecret } from "@/server/settings"
import { hasLiveSubscription } from "@/server/billing"
import type { OrgContext } from "@/server/authz"

export type BillingOverview =
  | { mode: "self_hosted" }
  | {
      mode: "cloud"
      /** Stripe keys are configured by the instance admin */
      configured: boolean
      plan: "self_hosted" | "free" | "cloud" | "comped"
      status: "none" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete"
      trialEndsAt: Date | null
      currentPeriodEndsAt: Date | null
      hasCustomer: boolean
      hasLiveSubscription: boolean
      price: { amount: number; currency: string; interval: "month" | "year" }
      trialDays: number
      locked: OrgContext["locked"]
    }

export async function loadBillingOverview(ctx: Pick<OrgContext, "org" | "locked">): Promise<BillingOverview> {
  const [general, billing] = await Promise.all([getSettings("general"), getSettings("billing")])
  if (general.mode !== "saas" || !billing.enabled) return { mode: "self_hosted" }
  const org = ctx.org
  return {
    mode: "cloud",
    configured: Boolean(readSecret(billing.stripeSecretKeyEnc)),
    plan: org.plan,
    status: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEndsAt: org.currentPeriodEndsAt,
    hasCustomer: Boolean(org.stripeCustomerId),
    hasLiveSubscription: hasLiveSubscription(org),
    price: { amount: billing.amount, currency: billing.currency, interval: billing.interval },
    trialDays: billing.trialDays,
    locked: ctx.locked,
  }
}
