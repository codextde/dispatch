import crypto from "node:crypto"

/**
 * Webhook signatures (Stripe-style):
 *
 *   X-Dispatch-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * Receivers recompute the HMAC with their webhook secret and reject stale
 * timestamps (replay protection).
 */

export function signWebhookPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  return `t=${timestamp},v1=${sig}`
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000)
): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=")
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    })
  )
  const t = Number(parts.t)
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > toleranceSeconds) return false
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(parts.v1, "hex")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
