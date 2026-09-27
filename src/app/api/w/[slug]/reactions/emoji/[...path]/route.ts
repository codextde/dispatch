import { ApiError, requireApiOrg, route } from "@/server/api"

/**
 * GET /api/w/[slug]/reactions/emoji/<locale>/<data|messages>.json
 *
 * Same-origin proxy for the emoji picker dataset (emojibase), so the
 * browser never talks to a third-party CDN (CSP: connect-src 'self').
 * Cached in memory per process.
 */
const EMOJIBASE = "https://cdn.jsdelivr.net/npm/emojibase-data@16"
const cache = ((globalThis as unknown as { __dispatchEmoji?: Map<string, { body: string; etag: string }> }).__dispatchEmoji ??= new Map())

export const GET = route<{ slug: string; path: string[] }>(async (req, { params }) => {
  const { slug, path } = await params
  await requireApiOrg(req, slug)
  const rel = path.join("/")
  if (!/^[a-z]{2}(-[a-z]{2})?\/(data|messages)\.json$/i.test(rel)) throw new ApiError(404, "Not found", "not_found")
  let hit = cache.get(rel)
  if (!hit) {
    const res = await fetch(`${EMOJIBASE}/${rel}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!res?.ok) throw new ApiError(502, "Emoji data is unavailable", "upstream_unavailable")
    const body = await res.text()
    hit = { body, etag: `"${rel.replace(/\W/g, "")}-${body.length}"` }
    cache.set(rel, hit)
  }
  if (req.headers.get("if-none-match") === hit.etag) return new Response(null, { status: 304, headers: { ETag: hit.etag } })
  return new Response(req.method === "HEAD" ? null : hit.body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=86400", ETag: hit.etag },
  })
})

export const HEAD = GET
