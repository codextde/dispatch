import net from "node:net"

/**
 * Classify IP addresses for the SSRF guard (see `net-guard.ts`). Pure — no
 * I/O — so it can be unit tested.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (incl. cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
]

function inV4Range(ip: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

function isPrivateV4(ip: string): boolean {
  return V4_BLOCKED.some(([base, bits]) => inV4Range(ip, base, bits))
}

/** Expand an IPv6 address into 8 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let addr = ip.split("%")[0]!.toLowerCase()
  // Embedded IPv4 (e.g. ::ffff:10.0.0.1)
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = ipv4ToInt(v4[1]!)
    addr = addr.slice(0, -v4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const [head, tail] = addr.split("::") as [string, string | undefined]
  const headParts = head ? head.split(":") : []
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : []
  const missing = 8 - headParts.length - tailParts.length
  if (tail === undefined && headParts.length !== 8) return null
  if (missing < 0) return null
  const groups = [...headParts, ...Array(tail === undefined ? 0 : missing).fill("0"), ...tailParts]
  if (groups.length !== 8) return null
  const nums = groups.map((g) => parseInt(g || "0", 16))
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums
}

/** The IPv4 address held by two 16-bit groups. */
function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip)
  if (!g) return true // unparsable => refuse
  const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0)
  // :: (unspecified) and ::1 (loopback)
  if (allZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (allZeroPrefix(5) && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(v4FromGroups(g[6]!, g[7]!))
  // IPv4-translated ::ffff:0:a.b.c.d (SIIT)
  if (allZeroPrefix(4) && g[4] === 0xffff && g[5] === 0) return isPrivateV4(v4FromGroups(g[6]!, g[7]!))
  // NAT64 64:ff9b::/96 — check embedded IPv4
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateV4(v4FromGroups(g[6]!, g[7]!))
  // Local-use NAT64 64:ff9b:1::/48 translates into the operator's own (private) network
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true
  // 6to4 2002::/16 — reaches the embedded IPv4 through a relay
  if (g[0] === 0x2002) return isPrivateV4(v4FromGroups(g[1]!, g[2]!))
  // 2001::/23 IETF protocol assignments: Teredo 2001::/32 (tunnels to an embedded IPv4), benchmarking, ORCHID …
  if (g[0] === 0x2001 && g[1]! < 0x0200) return true
  const first = g[0]!
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (first === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (first === 0x3fff && g[1]! < 0x1000) return true // documentation 3fff::/20
  if (first === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true // discard-only 100::/64
  return false
}

/**
 * True for loopback, private, link-local, CGNAT, multicast, reserved and
 * other non-public addresses (IPv4 and IPv6). Unparsable input returns true.
 */
export function isPrivateAddress(address: string): boolean {
  const kind = net.isIP(address.split("%")[0]!)
  if (kind === 4) return isPrivateV4(address)
  if (kind === 6) return isPrivateV6(address)
  return true
}
