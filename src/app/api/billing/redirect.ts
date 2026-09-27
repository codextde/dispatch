import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { assertSameOrigin } from "@/server/api"
import { loadOrgContext } from "@/server/authz"
import { audit } from "@/server/audit"
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session"
import { BillingError, type BillingErrorCode } from "@/server/billing"
import { getAppUrl } from "@/server/env"
import { ipFromHeaders } from "@/server/request"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Shared handler for `POST /api/billing/{checkout,portal}?slug=`: works with a
 * plain HTML form post and answers with a 303 redirect to Stripe, or back to
 * the billing page with `?error=` when something goes wrong.
 */
export async function billingRedirect(
  req: NextRequest,
  kind: "checkout" | "portal",
  createUrl: (orgId: string, userId: string) => Promise<string>
) {
  const slug = req.nextUrl.searchParams.get("slug") ?? ""
  const appUrl = getAppUrl()
  const back = (error: BillingErrorCode) => NextResponse.redirect(`${appUrl}/w/${slug}/settings/billing?error=${error}`, 303)

  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: { code: "not_found", message: "Workspace not found" } }, { status: 404 })

  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: { code: "csrf", message: "Cross-site request blocked" } }, { status: 403 })
  }

  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent(`/w/${slug}/settings/billing`)}`, 303)
  }
  const ctx = await loadOrgContext(slug)
  if (!ctx) return NextResponse.json({ error: { code: "not_found", message: "Workspace not found" } }, { status: 404 })
  if (!ctx.permissions.has("billing.manage")) return back("permission")

  try {
    const url = await createUrl(ctx.org.id, ctx.user.id)
    await audit({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      action: kind === "checkout" ? "billing.checkout_started" : "billing.portal_opened",
      targetType: "organization",
      targetId: ctx.org.id,
      ip: ipFromHeaders(req.headers),
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    })
    return NextResponse.redirect(url, 303)
  } catch (err) {
    if (err instanceof BillingError) return back(err.code)
    console.error(`[billing] ${kind} failed`, err)
    return back(kind === "checkout" ? "checkout_failed" : "portal_failed")
  }
}
