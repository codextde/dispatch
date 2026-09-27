import "server-only"
import { headers } from "next/headers"

/** Client IP (trusts the first X-Forwarded-For hop set by the reverse proxy, e.g. Traefik in Coolify). */
export function ipFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || null
}

export async function getRequestMeta() {
  const h = await headers()
  return {
    ip: ipFromHeaders(h),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  }
}
