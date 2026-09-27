"use server"

import { redirect, RedirectType } from "next/navigation"
import { z } from "zod"
import { action } from "@/server/action"
import { ApiError } from "@/server/api"
import { normalizeEmail, requestMagicLink, verifyLoginCode, verifyMagicToken } from "@/server/auth/magic-link"
import { getRequestMeta } from "@/server/request"
import { establishSession } from "./complete-login"

const nextSchema = z.string().max(2000).optional()

/** Step 1: email → sign-in link + 6-digit code (subject to sign-up policy and rate limits). */
export const requestLoginCodeAction = action(
  z.object({ email: z.string().trim().min(1, "Enter your email address").max(320), next: nextSchema }),
  async ({ email, next }) => {
    const meta = await getRequestMeta()
    const res = await requestMagicLink({ email, redirectTo: next, ip: meta.ip, userAgent: meta.userAgent })
    if (!res.ok) throw new ApiError(res.error === "rate_limited" ? 429 : 400, res.message, res.error)
    return { delivered: res.delivered, email: normalizeEmail(email) }
  }
)

/** Step 2: the 6-digit code from the email → session on this device, then navigate to the destination. */
export const verifyLoginCodeAction = action(
  z.object({
    email: z.string().trim().min(3).max(320),
    code: z.string().trim().max(12),
    next: nextSchema,
  }),
  async ({ email, code, next }) => {
    const meta = await getRequestMeta()
    const res = await verifyLoginCode(email, code, meta.ip)
    if (!res.ok) throw new ApiError(400, res.error)
    const redirectTo = await establishSession({
      userId: res.userId,
      email: res.email,
      method: "code",
      isNewUser: res.isNewUser,
      redirectTo: res.redirectTo || next,
    })
    redirect(redirectTo, RedirectType.replace)
  }
)

export type VerifyLinkState = { error: string | null }

/**
 * Magic link confirmation (/auth/verify). The link itself only renders a
 * confirmation page; this POST consumes the token, so link scanners that
 * pre-fetch URLs can't burn it.
 */
export async function verifyMagicLinkAction(_prev: VerifyLinkState, formData: FormData): Promise<VerifyLinkState> {
  const token = String(formData.get("token") ?? "")
  const res = await verifyMagicToken(token)
  if (!res.ok) return { error: res.error }
  const redirectTo = await establishSession({
    userId: res.userId,
    email: res.email,
    method: "link",
    isNewUser: res.isNewUser,
    redirectTo: res.redirectTo,
  })
  redirect(redirectTo)
}
