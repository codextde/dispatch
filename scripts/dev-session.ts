/**
 * Development helper: ensure a user (+ optional workspace) exists and print a
 * session cookie for testing API routes with curl.
 *
 *   pnpm dev:session alice@example.com --super-admin --org "Acme Inc"
 *   curl -H "Cookie: dispatch_session=<token>" http://localhost:3100/api/...
 *
 * Never available in production images.
 */
import { sql, eq } from "drizzle-orm"
import { db, schema } from "../src/server/db"
import { createSession } from "../src/server/auth/session"
import { createOrganization } from "../src/server/orgs"

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev-session is not available in production")
  const args = process.argv.slice(2)
  const email = (args.find((a) => !a.startsWith("--")) ?? "admin@dispatch.local").toLowerCase()
  const superAdmin = args.includes("--super-admin")
  const orgIdx = args.indexOf("--org")
  const orgName = orgIdx >= 0 ? args[orgIdx + 1] : undefined
  const nameIdx = args.indexOf("--name")
  const name = nameIdx >= 0 ? args[nameIdx + 1] : email.split("@")[0]

  let user = await db.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${email}` })
  if (!user) {
    ;[user] = await db.insert(schema.users).values({ email, name, isSuperAdmin: superAdmin }).returning()
  } else if (superAdmin && !user.isSuperAdmin) {
    ;[user] = await db.update(schema.users).set({ isSuperAdmin: true }).where(eq(schema.users.id, user.id)).returning()
  }

  let slug: string | undefined
  if (orgName) {
    const existing = await db
      .select({ slug: schema.organizations.slug })
      .from(schema.organizations)
      .innerJoin(schema.memberships, eq(schema.memberships.orgId, schema.organizations.id))
      .where(sql`${schema.organizations.name} = ${orgName} and ${schema.memberships.userId} = ${user!.id}`)
      .limit(1)
    slug = existing[0]?.slug ?? (await createOrganization({ name: orgName, ownerId: user!.id })).slug
  }

  const { token } = await createSession(user!.id, { userAgent: "dev-session script", ip: "127.0.0.1" })
  console.log(JSON.stringify({ userId: user!.id, email, superAdmin: user!.isSuperAdmin, orgSlug: slug, cookie: `dispatch_session=${token}` }, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
