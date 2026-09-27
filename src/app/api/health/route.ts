import { sql } from "drizzle-orm"
import { db } from "@/server/db"
import pkg from "../../../../package.json"

/**
 * Liveness/readiness probe for Docker, Coolify and uptime monitors.
 * Public and unauthenticated, so it must never expose anything sensitive.
 *
 *   GET /api/health  →  200 { status: "ok", version, db: "ok", uptime }
 *                    →  503 { status: "error", version, db: "error", uptime }
 */
export const dynamic = "force-dynamic"

const DB_TIMEOUT_MS = 3_000

async function checkDatabase(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS)
      }),
    ])
    return true
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err)
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const dbOk = await checkDatabase()
  return Response.json(
    { status: dbOk ? "ok" : "error", version: pkg.version, db: dbOk ? "ok" : "error", uptime: Math.round(process.uptime()) },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  )
}
