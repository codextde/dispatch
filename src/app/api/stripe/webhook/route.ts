import { NextResponse, type NextRequest } from "next/server"
import type Stripe from "stripe"
import { and, like, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { audit } from "@/server/audit"
import { getSettings, readSecret } from "@/server/settings"
import { getStripe, invoiceSubscriptionId, syncSubscription } from "@/server/billing"

/**
 * Stripe webhook endpoint. Configure in the Stripe dashboard:
 *   URL:    <APP_URL>/api/stripe/webhook
 *   Events: checkout.session.completed, customer.subscription.created,
 *           customer.subscription.updated, customer.subscription.deleted,
 *           invoice.paid, invoice.payment_failed
 *
 * Server-to-server (no session / CSRF check): authenticity comes from the
 * Stripe-Signature header. Handlers re-fetch the subscription from Stripe and
 * sync its current state, so retries and out-of-order deliveries are safe.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
])

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature")
  const body = await req.text()

  let stripe: Stripe
  let secret: string | undefined
  try {
    stripe = await getStripe()
    secret = readSecret((await getSettings("billing")).stripeWebhookSecretEnc)
  } catch {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 400 })
  }
  if (!signature || !secret) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true, ignored: true })

  // Skip events we already processed (Stripe retries on timeouts).
  const seen = await db
    .select({ id: schema.auditLogs.id })
    .from(schema.auditLogs)
    .where(and(like(schema.auditLogs.action, "billing.%"), sql`${schema.auditLogs.metadata}->>'eventId' = ${event.id}`))
    .limit(1)
  if (seen.length) return NextResponse.json({ received: true, duplicate: true })

  try {
    const subscriptionId = subscriptionIdFor(event)
    if (!subscriptionId) return NextResponse.json({ received: true, ignored: true })
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const result = await syncSubscription(subscription)
    if (result) {
      await audit({
        orgId: result.orgId,
        action: `billing.${auditVerb(event.type)}`,
        targetType: "subscription",
        targetId: subscription.id,
        metadata: { eventId: event.id, eventType: event.type, status: result.status, livemode: event.livemode },
      })
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    // 500 lets Stripe retry later (e.g. a transient Stripe/API or database error).
    console.error("[stripe] webhook processing failed", event.type, event.id, err)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

function subscriptionIdFor(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      if (session.mode !== "subscription" || !session.subscription) return null
      return typeof session.subscription === "string" ? session.subscription : session.subscription.id
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id
    case "invoice.paid":
    case "invoice.payment_failed":
      return invoiceSubscriptionId(event.data.object)
    default:
      return null
  }
}

function auditVerb(type: string) {
  switch (type) {
    case "checkout.session.completed":
      return "checkout_completed"
    case "customer.subscription.created":
      return "subscription_created"
    case "customer.subscription.updated":
      return "subscription_updated"
    case "customer.subscription.deleted":
      return "subscription_canceled"
    case "invoice.paid":
      return "invoice_paid"
    case "invoice.payment_failed":
      return "payment_failed"
    default:
      return type.replace(/\./g, "_")
  }
}

