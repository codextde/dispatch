import "server-only"
import { headers } from "next/headers"

/**
 * Client IP as seen by our reverse proxy (Traefik in Coolify, Caddy, nginx).
 * `X-Real-IP` is set (overwritten) by the proxy; otherwise use the right-most
 * `X-Forwarded-For` entry, which is the one appended by the proxy — the
 * left-most entries are client-controlled and must not be trusted.
 */
export function ipFromHeaders(h: Headers): string | null {
  const real = h.get("x-real-ip")?.trim()
  if (real) return real
  const xff = h.get("x-forwarded-for")
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean)
    if (hops.length) return hops[hops.length - 1]!
  }
  return null
}

export async function getRequestMeta() {
  const h = await headers()
  return {
    ip: ipFromHeaders(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  }
}
