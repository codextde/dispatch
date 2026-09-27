"use server"

import { z } from "zod"
import { action } from "@/server/action"
import { assertPermission, requireOrg } from "@/server/authz"
import { BILLING_ERRORS, BillingError, isBillingActive, refreshOrgSubscription } from "@/server/billing"
import { fail, revalidateWorkspace } from "@/server/workspace/context"

/**
 * Re-read the subscription from Stripe (used right after Checkout returns, in
 * case the webhook hasn't arrived yet). Allowed while the workspace is
 * locked — that's exactly when members need to fix billing.
 */
export const syncBillingStatus = action(z.object({ slug: z.string().min(1).max(64) }), async (input) => {
  const ctx = await requireOrg(input.slug)
  assertPermission(ctx, "billing.manage")
  if (!(await isBillingActive())) fail(BILLING_ERRORS.not_enabled)
  try {
    const status = await refreshOrgSubscription(ctx.org.id)
    revalidateWorkspace()
    return { status }
  } catch (err) {
    if (err instanceof BillingError) fail(err.message)
    console.error("[billing] refresh failed", err)
    fail(BILLING_ERRORS.refresh_failed)
  }
})
