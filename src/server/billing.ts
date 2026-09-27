import "server-only"
import Stripe from "stripe"
import { and, eq, isNull } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getSettings, readSecret, updateSettings } from "@/server/settings"
import { getAppUrl } from "@/server/env"
import { publish } from "@/server/realtime"

/**
 * Hosted-cloud billing (Stripe). Only active when the instance runs in
 * "saas" mode with billing enabled in Admin → Billing. Self-hosted instances
 * never touch Stripe.
 *
 * Flow: Settings → Billing → Subscribe → Stripe Checkout → webhook
 * (/api/stripe/webhook) → `syncSubscription()` updates the organization's
 * subscription state, which `computeLock()` (src/server/authz.ts) enforces.
 */

type Org = typeof schema.organizations.$inferSelect
type SubscriptionStatus = Org["subscriptionStatus"]

/** User-facing billing errors. Codes travel in URLs (`?error=`), never free text. */
export const BILLING_ERRORS = {
  not_enabled: "Billing isn't enabled on this instance.",
  not_configured: "Stripe isn't configured yet. Ask the instance administrator to add the Stripe keys in Admin → Billing.",
  invalid_price: "The subscription price configured by the instance administrator is invalid.",
  free_plan: "This workspace is on a free plan and doesn't need a subscription.",
  already_subscribed: "This workspace already has a subscription. Use “Manage billing” to change it.",
  no_customer: "This workspace has no billing account yet. Subscribe first.",
  customer_failed: "Couldn't create the billing account. Please try again.",
  no_checkout_url: "Stripe didn't return a checkout page. Please try again.",
  permission: "You don't have permission to manage billing.",
  checkout_failed: "Couldn't start checkout with Stripe. Please try again in a moment.",
  portal_failed: "Couldn't open the billing portal. Make sure the customer portal is enabled in Stripe, then try again.",
  refresh_failed: "Couldn't reach Stripe to refresh the subscription. Please try again.",
  not_found: "Workspace not found.",
} as const
export type BillingErrorCode = keyof typeof BILLING_ERRORS

export class BillingError extends Error {
  constructor(public code: BillingErrorCode) {
    super(BILLING_ERRORS[code])
    this.name = "BillingError"
  }
}

const stripeClients = new Map<string, Stripe>()

/** Stripe client for the configured secret key (cached per key). */
export async function getStripe(): Promise<Stripe> {
  const cfg = await getSettings("billing")
  const key = readSecret(cfg.stripeSecretKeyEnc)
  if (!key) throw new BillingError("not_configured")
  let client = stripeClients.get(key)
  if (!client) {
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "Dispatch" },
    })
    stripeClients.clear()
    stripeClients.set(key, client)
  }
  return client
}

/** Billing is live: SaaS mode, billing enabled and a Stripe secret key present. */
export async function isBillingActive(): Promise<boolean> {
  const [general, billing] = await Promise.all([getSettings("general"), getSettings("billing")])
  return general.mode === "saas" && billing.enabled && Boolean(readSecret(billing.stripeSecretKeyEnc))
}

/* ---------------------------------------------------------------------------------------------- */
/*                                        Product & price                                         */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Make sure the "Dispatch Cloud" product and a recurring price matching the
 * configured amount / currency / interval exist in Stripe. When the amount
 * changes, a new price becomes the product default and the old one is
 * archived (existing subscriptions keep their price until migrated in Stripe).
 * Ids are persisted in the billing settings.
 */
export async function ensureStripePrice(): Promise<{ productId: string; priceId: string }> {
  const [cfg, branding] = await Promise.all([getSettings("billing"), getSettings("branding")])
  const stripe = await getStripe()
  const currency = cfg.currency.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) throw new BillingError("invalid_price")
  if (!Number.isInteger(cfg.amount) || cfg.amount < 50) throw new BillingError("invalid_price")
  const productName = `${branding.productName || "Dispatch"} Cloud`

  // Product
  let product: Stripe.Product | null = null
  if (cfg.productId) {
    product = await stripe.products.retrieve(cfg.productId).catch((err: unknown) => {
      if (isMissingResource(err)) return null
      throw err
    })
    if (product && (product as unknown as { deleted?: boolean }).deleted) product = null
  }
  if (!product) {
    product = await stripe.products.create({
      name: productName,
      description: "Shared inboxes for your whole team — unlimited users per workspace.",
      metadata: { app: "dispatch" },
    })
  } else if (!product.active) {
    product = await stripe.products.update(product.id, { active: true })
  }

  // Price
  let price: Stripe.Price | null = null
  if (cfg.priceId) {
    price = await stripe.prices.retrieve(cfg.priceId).catch((err: unknown) => {
      if (isMissingResource(err)) return null
      throw err
    })
  }
  const matches =
    price !== null &&
    price.active &&
    (typeof price.product === "string" ? price.product : price.product.id) === product.id &&
    price.unit_amount === cfg.amount &&
    price.currency === currency &&
    price.recurring?.interval === cfg.interval &&
    (price.recurring?.interval_count ?? 1) === 1

  if (!matches) {
    const previous = price
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: cfg.amount,
      currency,
      recurring: { interval: cfg.interval },
      nickname: `${productName} (${cfg.interval}ly)`,
      metadata: { app: "dispatch" },
    })
    await stripe.products.update(product.id, { default_price: price.id })
    if (previous?.active) {
      await stripe.prices.update(previous.id, { active: false }).catch((err: unknown) => {
        console.warn("[billing] could not archive previous price", previous.id, err)
      })
    }
  } else if (price && product.default_price !== price.id) {
    const defaultId = typeof product.default_price === "string" ? product.default_price : product.default_price?.id
    if (defaultId !== price.id) await stripe.products.update(product.id, { default_price: price.id })
  }

  const result = { productId: product.id, priceId: price!.id }
  if (result.productId !== cfg.productId || result.priceId !== cfg.priceId) {
    await updateSettings("billing", result)
  }
  return result
}

function isMissingResource(err: unknown) {
  return Boolean(
    err &&
      typeof err === "object" &&
      ((err as { code?: string }).code === "resource_missing" || (err as { statusCode?: number }).statusCode === 404)
  )
}

/* ---------------------------------------------------------------------------------------------- */
/*                                      Checkout & portal                                         */
/* ---------------------------------------------------------------------------------------------- */

/** Statuses in which a Stripe subscription still exists and should be managed via the portal. */
export const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "unpaid", "incomplete"]

export function hasLiveSubscription(org: Pick<Org, "stripeSubscriptionId" | "subscriptionStatus">) {
  return Boolean(org.stripeSubscriptionId) && LIVE_SUBSCRIPTION_STATUSES.includes(org.subscriptionStatus)
}

async function loadOrg(orgId: string): Promise<Org> {
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, orgId) })
  if (!org) throw new BillingError("not_found")
  return org
}

function billingPageUrl(slug: string, query?: string) {
  return `${getAppUrl()}/w/${slug}/settings/billing${query ? `?${query}` : ""}`
}

/**
 * Reuse the org's Stripe customer or create one. Concurrent requests are
 * resolved with a conditional update: the loser deletes its duplicate.
 */
async function ensureCustomer(stripe: Stripe, org: Org, email: string | null): Promise<string> {
  if (org.stripeCustomerId) {
    const existing = await stripe.customers.retrieve(org.stripeCustomerId).catch((err: unknown) => {
      if (isMissingResource(err)) return null
      throw err
    })
    if (existing && !existing.deleted) return existing.id
  }
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: org.name,
    metadata: { orgId: org.id, orgSlug: org.slug },
  })
  const [updated] = await db
    .update(schema.organizations)
    .set({ stripeCustomerId: customer.id })
    .where(
      and(
        eq(schema.organizations.id, org.id),
        org.stripeCustomerId ? eq(schema.organizations.stripeCustomerId, org.stripeCustomerId) : isNull(schema.organizations.stripeCustomerId)
      )
    )
    .returning({ id: schema.organizations.stripeCustomerId })
  if (updated?.id === customer.id) return customer.id
  // Another request created a customer first — use theirs.
  await stripe.customers.del(customer.id).catch(() => {})
  const fresh = await loadOrg(org.id)
  if (!fresh.stripeCustomerId) throw new BillingError("customer_failed")
  return fresh.stripeCustomerId
}

/**
 * Trial handling for a first subscription:
 *  - never subscribed and the app-level trial is still running → the
 *    remaining trial carries over into Stripe (trial_end), so subscribing
 *    early never shortens the trial;
 *  - never subscribed and no app-level trial was granted → `trialDays`;
 *  - otherwise (resubscribing, trial used up) → no trial.
 */
function trialFor(org: Org, trialDays: number): { trial_end?: number; trial_period_days?: number } {
  if (org.stripeSubscriptionId) return {}
  const minTrialEnd = Date.now() + 49 * 3_600_000 // Checkout requires the trial to end ≥ 48h from now
  if (org.trialEndsAt) {
    return org.trialEndsAt.getTime() > minTrialEnd ? { trial_end: Math.floor(org.trialEndsAt.getTime() / 1000) } : {}
  }
  return trialDays > 0 ? { trial_period_days: trialDays } : {}
}

/** Create a Stripe Checkout session for the workspace. Returns the Checkout URL. */
export async function createCheckoutSession(orgId: string, userId: string): Promise<string> {
  if (!(await isBillingActive())) throw new BillingError("not_enabled")
  const [org, user, cfg] = await Promise.all([
    loadOrg(orgId),
    db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { email: true } }),
    getSettings("billing"),
  ])
  if (org.plan === "comped" || org.plan === "free") throw new BillingError("free_plan")
  if (hasLiveSubscription(org)) throw new BillingError("already_subscribed")

  const stripe = await getStripe()
  const { priceId } = await ensureStripePrice()
  const customer = await ensureCustomer(stripe, org, user?.email ?? null)

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: org.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_update: { name: "auto", address: "auto" },
    subscription_data: {
      metadata: { orgId: org.id, orgSlug: org.slug },
      ...trialFor(org, cfg.trialDays),
    },
    metadata: { orgId: org.id },
    success_url: billingPageUrl(org.slug, "checkout=success"),
    cancel_url: billingPageUrl(org.slug, "checkout=canceled"),
  })
  if (!session.url) throw new BillingError("no_checkout_url")
  return session.url
}

/** Create a Stripe customer portal session (payment method, invoices, cancel). */
export async function createPortalSession(orgId: string): Promise<string> {
  const org = await loadOrg(orgId)
  if (!org.stripeCustomerId) throw new BillingError("no_customer")
  const stripe = await getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: billingPageUrl(org.slug),
  })
  return session.url
}

/* ---------------------------------------------------------------------------------------------- */
/*                                      Subscription sync                                         */
/* ---------------------------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "unpaid",
}

/** Stripe subscription status → organizations.subscriptionStatus. */
export function mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  return STATUS_MAP[status] ?? "incomplete"
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Latest period end across the subscription items (API ≥ 2025-03 keeps periods on items). */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items?.data?.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number") ?? []
  return ends.length ? new Date(Math.max(...ends) * 1000) : null
}

/**
 * Mirror a Stripe subscription onto its organization. State based and
 * idempotent: safe to call repeatedly and with out-of-order events. Returns
 * the affected org (or null when no org matches).
 */
export async function syncSubscription(
  subscription: Stripe.Subscription
): Promise<{ orgId: string; status: SubscriptionStatus } | null> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const metaOrgId = subscription.metadata?.orgId
  const o = schema.organizations

  // Trust our own stored mapping first; metadata only links an org that has no
  // Stripe customer yet (or the same one), so a subscription can't be attached
  // to an arbitrary workspace by editing its metadata.
  let org: Org | undefined = await db.query.organizations.findFirst({ where: eq(o.stripeSubscriptionId, subscription.id) })
  if (!org && customerId) org = await db.query.organizations.findFirst({ where: eq(o.stripeCustomerId, customerId) })
  if (!org && metaOrgId && UUID_RE.test(metaOrgId)) {
    const candidate = await db.query.organizations.findFirst({ where: eq(o.id, metaOrgId) })
    if (candidate && (!candidate.stripeCustomerId || candidate.stripeCustomerId === customerId)) org = candidate
  }
  if (!org) {
    console.warn("[billing] no workspace for subscription", subscription.id)
    return null
  }

  const status = mapSubscriptionStatus(subscription.status)
  const live = status === "active" || status === "trialing" || status === "past_due"

  // Never let an old, ended subscription overwrite a different current one.
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== subscription.id && !live && hasLiveSubscription(org)) {
    return { orgId: org.id, status: org.subscriptionStatus }
  }

  const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : org.trialEndsAt
  await db
    .update(o)
    .set({
      subscriptionStatus: status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId ?? org.stripeCustomerId,
      currentPeriodEndsAt: periodEnd(subscription) ?? org.currentPeriodEndsAt,
      trialEndsAt,
      plan: org.plan === "comped" || org.plan === "free" ? org.plan : "cloud",
    })
    .where(eq(o.id, org.id))

  await publish({ orgId: org.id, type: "org.updated", data: { billing: status } })
  return { orgId: org.id, status }
}

/** Pull the current subscription state from Stripe (e.g. right after Checkout returns). */
export async function refreshOrgSubscription(orgId: string): Promise<SubscriptionStatus> {
  const org = await loadOrg(orgId)
  const stripe = await getStripe()
  let subscription: Stripe.Subscription | null = null
  if (org.stripeSubscriptionId) {
    subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId).catch((err: unknown) => {
      if (isMissingResource(err)) return null
      throw err
    })
  }
  if ((!subscription || !["active", "trialing", "past_due"].includes(subscription.status)) && org.stripeCustomerId) {
    const list = await stripe.subscriptions.list({ customer: org.stripeCustomerId, status: "all", limit: 10 })
    const ranked = [...list.data].sort((a, b) => rank(b.status) - rank(a.status) || b.created - a.created)
    subscription = ranked[0] ?? subscription
  }
  if (!subscription) return org.subscriptionStatus
  const res = await syncSubscription(subscription)
  return res?.status ?? org.subscriptionStatus
}

function rank(status: Stripe.Subscription.Status) {
  return status === "active" ? 5 : status === "trialing" ? 4 : status === "past_due" ? 3 : status === "unpaid" ? 2 : status === "incomplete" ? 1 : 0
}

/** Subscription id referenced by an invoice (API ≥ 2025-03: invoice.parent.subscription_details). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === "string" ? sub : sub.id
}
