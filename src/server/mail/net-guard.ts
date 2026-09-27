import "server-only"
import dns from "node:dns"
import net from "node:net"
import { inArray } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { isPrivateAddress } from "./ip-ranges"

/**
 * SSRF guard for outgoing connections to user-supplied hosts (IMAP, SMTP,
 * webhooks). Enabled with Admin → Security → "Block private networks"
 * (recommended for multi-tenant SaaS instances).
 *
 * Always on in SaaS mode. If the settings cannot be read the guard fails
 * closed (blocks).
 *
 * When enabled, a host is resolved once, every address is checked, and the
 * connection is pinned to the checked address (TLS still verifies the
 * original hostname via SNI/servername) so DNS rebinding cannot swap in a
 * private address between the check and the connect.
 */

export class BlockedHostError extends Error {
  code = "EBLOCKEDHOST"
  constructor(host: string) {
    super(`Connections to private or internal network addresses are not allowed (${host}).`)
  }
}

const CACHE_MS = 5_000
let cached: { value: boolean; at: number } | null = null

export async function isPrivateNetworkBlocked(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
  try {
    // Read raw rows: getSettings() falls back to defaults (guard off) on errors
    const rows = await db
      .select({ key: schema.instanceSettings.key, value: schema.instanceSettings.value })
      .from(schema.instanceSettings)
      .where(inArray(schema.instanceSettings.key, ["security", "general"]))
    const security = rows.find((r) => r.key === "security")?.value as { blockPrivateNetworks?: unknown } | undefined
    const general = rows.find((r) => r.key === "general")?.value as { mode?: unknown } | undefined
    const value = general?.mode === "saas" || security?.blockPrivateNetworks === true
    cached = { value, at: Date.now() }
    return value
  } catch {
    return true
  }
}

/** True when `host` only resolves to private / loopback addresses (e.g. an internal relay, a dev server). */
export async function isPrivateHost(host: string): Promise<boolean> {
  try {
    const addresses = await resolveAll(host)
    return addresses.every((a) => isPrivateAddress(a.address))
  } catch {
    return false
  }
}

async function resolveAll(host: string): Promise<{ address: string; family: number }[]> {
  const bare = host.replace(/^\[|\]$/g, "")
  if (net.isIP(bare)) return [{ address: bare, family: net.isIP(bare) }]
  const results = await dns.promises.lookup(bare, { all: true, verbatim: true })
  if (!results.length) throw Object.assign(new Error(`Host not found: ${host}`), { code: "ENOTFOUND" })
  return results
}

/**
 * Check `host` against the guard. Returns the address to connect to when the
 * guard is active (pinned), or `null` when connections may use the hostname
 * directly. Throws `BlockedHostError` for private targets.
 */
export async function resolveConnectTarget(host: string): Promise<{ address: string; family: number } | null> {
  if (!(await isPrivateNetworkBlocked())) return null
  const addresses = await resolveAll(host)
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new BlockedHostError(host)
  return addresses[0]!
}

/** Throw if `host` is not allowed (no pinning). */
export async function assertHostAllowed(host: string): Promise<void> {
  await resolveConnectTarget(host)
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void

/**
 * `lookup` implementation for `http.request` / `net.connect` that refuses
 * private addresses. Validation happens on the address actually used for the
 * connection, which also defeats DNS rebinding.
 */
export function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0)
    const list = addresses as dns.LookupAddress[]
    if (!list.length) return callback(Object.assign(new Error(`Host not found: ${hostname}`), { code: "ENOTFOUND" }), "", 0)
    if (list.some((a) => isPrivateAddress(a.address))) return callback(new BlockedHostError(hostname), "", 0)
    if (options.all) return callback(null, list)
    callback(null, list[0]!.address, list[0]!.family)
  })
}
