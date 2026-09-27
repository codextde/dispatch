import type { NextRequest } from "next/server"
import { createPortalSession } from "@/server/billing"
import { billingRedirect } from "../redirect"

/** `POST /api/billing/portal?slug=<workspace>` → 303 to the Stripe customer portal. */
export async function POST(req: NextRequest) {
  return billingRedirect(req, "portal", (orgId) => createPortalSession(orgId))
}
