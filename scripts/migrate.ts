/**
 * Apply database migrations (drizzle/*.sql). Safe to run concurrently from
 * multiple containers: guarded by a Postgres advisory lock.
 *
 *   pnpm db:migrate                 (development)
 *   node dist/migrate.mjs           (production image, runs on container start)
 */
import path from "node:path"
import fs from "node:fs"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { getDatabaseUrl } from "../src/server/env"

async function waitForDb(url: string, attempts = 60) {
  for (let i = 1; i <= attempts; i++) {
    const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} })
    try {
      await sql`select 1`
      await sql.end()
      return
    } catch (err) {
      await sql.end({ timeout: 1 }).catch(() => {})
      if (i === attempts) throw err
      console.log(`[migrate] waiting for database (${i}/${attempts})...`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

async function main() {
  const url = getDatabaseUrl()
  await waitForDb(url)
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
    path.join(path.dirname(process.argv[1] ?? "."), "..", "drizzle"),
  ].filter(Boolean) as string[]
  const migrationsFolder = candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json")))
  if (!migrationsFolder) throw new Error("Migrations folder not found")

  await sql`select pg_advisory_lock(727274)`
  try {
    await migrate(drizzle(sql), { migrationsFolder })
    console.log("[migrate] database is up to date")
  } finally {
    await sql`select pg_advisory_unlock(727274)`
    await sql.end()
  }
}

main().catch((err) => {
  console.error("[migrate] failed", err)
  process.exit(1)
})
