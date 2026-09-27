import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/server/db"

/**
 * Fixed-window rate limiter backed by Postgres (works across multiple app
 * containers). Returns `{ ok, remaining, resetAt }`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSeconds}) else rate_limits.reset_at end
    returning count, reset_at
  `)
  const row = rows[0]!
  const count = Number(row.count)
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt: new Date(row.reset_at) }
}

export async function cleanupRateLimits() {
  await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`)
}
