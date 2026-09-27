import "server-only"
import { headers } from "next/headers"

/**
 * Client IP as seen by our reverse proxy (Traefik in Coolify, Caddy, nginx).
 *
 * Proxies *append* the connecting address to `X-Forwarded-For`, so the
 * right-most entry is the only one we can trust (left-most entries are
 * client-controlled). `X-Real-IP` is only used when there is no XFF at all,
 * because some proxies pass a client-supplied `X-Real-IP` through unchanged.
 */
export function ipFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for")
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean)
    if (hops.length) return hops[hops.length - 1]!
  }
  return h.get("x-real-ip")?.trim() || null
}

export async function getRequestMeta() {
  const h = await headers()
  return {
    ip: ipFromHeaders(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  }
}
