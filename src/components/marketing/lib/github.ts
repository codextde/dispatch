import "server-only"
import { GITHUB_REPO } from "@/content/marketing/site"

/**
 * Star count for the header / CTA buttons. Cached in memory for an hour (and
 * for five minutes after a failure) so marketing pages never wait on GitHub.
 */
let cached: { value: number | null; at: number; ttl: number } | null = null
let inflight: Promise<number | null> | null = null

export async function getGitHubStars(): Promise<number | null> {
  if (cached && Date.now() - cached.at < cached.ttl) return cached.value
  if (inflight) return cached?.value ?? null
  inflight = fetchStars()
    .then((value) => {
      cached = { value, at: Date.now(), ttl: value === null ? 5 * 60_000 : 60 * 60_000 }
      return value
    })
    .finally(() => {
      inflight = null
    })
  // First request waits briefly; later ones use the cache while refreshing.
  return cached ? cached.value : inflight
}

async function fetchStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "dispatch-marketing" },
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { stargazers_count?: unknown }
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null
  } catch {
    return null
  }
}

export function formatStars(n: number | null): string | null {
  if (n === null) return null
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
}
