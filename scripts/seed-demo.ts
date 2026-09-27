/**
 * Seed (or remove) the Northwind demo data in a workspace.
 *
 *   pnpm tsx --conditions=react-server scripts/seed-demo.ts <orgSlug> <userEmail>
 *   pnpm tsx --conditions=react-server scripts/seed-demo.ts <orgSlug> <userEmail> --reset
 *   pnpm tsx --conditions=react-server scripts/seed-demo.ts <orgSlug> --remove
 *
 * `userEmail` is the member who receives assignments, mentions and notifications.
 */
import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "../src/server/db"
import { hasDemoData, removeDemoData, seedDemoData } from "../src/server/demo"

async function main() {
  const args = process.argv.slice(2)
  const [slug, email] = args.filter((a) => !a.startsWith("--"))
  const remove = args.includes("--remove")
  const reset = args.includes("--reset")
  if (!slug || (!remove && !email)) {
    console.error("Usage: scripts/seed-demo.ts <orgSlug> <userEmail> [--reset] | <orgSlug> --remove")
    process.exit(1)
  }

  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.slug, slug) })
  if (!org) throw new Error(`Workspace "${slug}" not found`)

  if (remove || reset) {
    await removeDemoData(org.id)
    console.log(`Removed demo data from ${slug}`)
    if (remove) process.exit(0)
  }

  const user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email!.toLowerCase()}` })
  if (!user) throw new Error(`User ${email} not found`)
  const member = await db.query.memberships.findFirst({
    where: and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, user.id)),
  })
  if (!member) throw new Error(`${email} is not a member of ${slug}`)

  const started = Date.now()
  const result = await seedDemoData(org.id, user.id)
  console.log(
    JSON.stringify({ workspace: slug, ...result, hasDemoData: await hasDemoData(org.id), ms: Date.now() - started }, null, 2)
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
