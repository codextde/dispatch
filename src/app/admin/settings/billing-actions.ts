"use server"

import { z } from "zod"
import { adminAction } from "@/server/admin/guard"
import { ApiError } from "@/server/api"
import { BillingError, ensureStripePrice } from "@/server/billing"

/**
 * Create (or refresh after an amount/currency/interval change) the Stripe
 * product and recurring price used for hosted workspace subscriptions.
 * Kept separate from ./actions so the Stripe module only loads for billing.
 */
export const createStripePriceAction = adminAction(z.object({}), async (_input, admin) => {
  let result: { productId: string; priceId: string }
  try {
    result = await ensureStripePrice()
  } catch (err) {
    throw toFriendlyError(err)
  }
  await admin.audit("admin.stripe_price_created", {
    targetType: "settings",
    targetId: "billing",
    metadata: result,
  })
  return result
})

function toFriendlyError(err: unknown) {
  if (err instanceof BillingError) {
    if (err.code === "not_configured") return new ApiError(400, "Save a Stripe secret key first.")
    if (err.code === "invalid_price") return new ApiError(400, "The price must be at least 0.50 and the currency a 3-letter ISO code.")
    return new ApiError(400, err.message)
  }
  const e = err as { type?: string; message?: string }
  if (typeof e?.type === "string" && e.type.startsWith("Stripe")) {
    return new ApiError(400, `Stripe: ${e.message ?? "request failed"}`)
  }
  return err
}
