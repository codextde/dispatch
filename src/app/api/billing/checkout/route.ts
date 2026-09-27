import type { NextRequest } from "next/server"
import { createCheckoutSession } from "@/server/billing"
import { billingRedirect } from "../redirect"

/** `POST /api/billing/checkout?slug=<workspace>` → 303 to Stripe Checkout. */
export async function POST(req: NextRequest) {
  return billingRedirect(req, "checkout", createCheckoutSession)
}
