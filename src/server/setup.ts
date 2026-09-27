import "server-only"
import crypto from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getAppUrl, getDataDir, isSecureContext } from "@/server/env"
import { getSettings, updateSettings } from "@/server/settings"
import { getCurrentSession, type CurrentSession } from "@/server/auth/session"
import { randomToken, safeEqual } from "@/server/crypto"
import { rateLimit } from "@/server/rate-limit"
import { createOrganization, RESERVED_SLUGS, slugify, uniqueSlug } from "@/server/orgs"

/**
 * First-run setup
 * ---------------
 * The setup wizard (/setup) is available until `settings.setup.completedAt`
 * is set. Its first step creates the initial super admin *without* email
 * verification — so it is strictly guarded:
 *  - it requires the one-time setup code printed to the server logs (so only
 *    the operator of the server can claim a fresh instance)
 *  - only possible while no super admin exists (serialized with a Postgres
 *    advisory lock so two concurrent requests can't both create one)
 *  - every later step requires the signed-in super admin
 */

const SETUP_LOCK = "dispatch:setup:first-super-admin"

export class SetupError extends Error {}

export async function superAdminExists(): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.isSuperAdmin, true),
    columns: { id: true },
  })
  return Boolean(row)
}

export type SetupStatus = {
  completed: boolean
  hasSuperAdmin: boolean
  session: CurrentSession | null
  /** The current visitor is a super admin who may continue the wizard */
  isSetupActor: boolean
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const [setup, hasSuperAdmin, session] = await Promise.all([
    getSettings("setup"),
    superAdminExists(),
    getCurrentSession(),
  ])
  return {
    completed: Boolean(setup.completedAt),
    hasSuperAdmin,
    session,
    isSetupActor: Boolean(session?.user.isSuperAdmin && !session.session.impersonatorId),
  }
}

/** Guard for wizard steps after account creation. */
export async function requireSetupActor(): Promise<CurrentSession> {
  // Lazy: keeps this module importable from plain Node scripts (authz pulls in next/navigation)
  const { AuthError } = await import("@/server/authz")
  const status = await getSetupStatus()
  if (status.completed) throw new AuthError(403, "Setup has already been completed.")
  if (!status.session || !status.isSetupActor) throw new AuthError(403, "Sign in as the instance owner to continue setup.")
  return status.session
}

/**
 * Create the first super admin. Throws SetupError when setup is complete or a
 * super admin already exists. If a (non admin) user with that email already
 * exists it is promoted instead.
 */
export async function createFirstSuperAdmin(input: { name: string; email: string }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SETUP_LOCK}))`)
    const setupRow = await tx.query.instanceSettings.findFirst({ where: eq(schema.instanceSettings.key, "setup") })
    const completedAt = (setupRow?.value as { completedAt?: string | null } | undefined)?.completedAt
    if (completedAt) throw new SetupError("Setup has already been completed.")
    const existingAdmin = await tx.query.users.findFirst({
      where: eq(schema.users.isSuperAdmin, true),
      columns: { id: true },
    })
    if (existingAdmin) throw new SetupError("An instance owner already exists. Sign in to continue setup.")

    const existing = await tx.query.users.findFirst({ where: sql`lower(${schema.users.email}) = ${input.email}` })
    if (existing) {
      const [user] = await tx
        .update(schema.users)
        .set({ isSuperAdmin: true, status: "active", name: existing.name || input.name })
        .where(eq(schema.users.id, existing.id))
        .returning()
      return user!
    }
    const [user] = await tx
      .insert(schema.users)
      .values({ email: input.email, name: input.name, isSuperAdmin: true })
      .returning()
    return user!
  })
}

export async function completeSetup(userId: string) {
  await updateSettings("setup", { completedAt: new Date().toISOString() }, { userId })
  await clearSetupCode()
}

/** Instance settings sections that have been saved at least once (used to resume the wizard). */
export async function savedSettingsSections(): Promise<Set<string>> {
  const rows = await db.select({ key: schema.instanceSettings.key }).from(schema.instanceSettings)
  return new Set(rows.map((r) => r.key))
}

/* ------------------------------- Workspaces ------------------------------- */

export type SlugCheck = { slug: string; available: boolean; reason?: "short" | "reserved" | "taken"; suggestion?: string }

/** Normalize a requested workspace URL and check whether it is free. */
export async function checkSlugAvailability(raw: string): Promise<SlugCheck> {
  const slug = raw.trim() ? slugify(raw) : ""
  if (slug.length < 2) return { slug, available: false, reason: "short" }
  if (RESERVED_SLUGS.has(slug)) return { slug, available: false, reason: "reserved", suggestion: await uniqueSlug(slug) }
  const exists = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, slug),
    columns: { id: true },
  })
  if (exists) return { slug, available: false, reason: "taken", suggestion: await uniqueSlug(slug) }
  return { slug, available: true }
}

/** May this user create (another) workspace, per `auth.workspaceCreation`? */
export async function canCreateWorkspace(user: { isSuperAdmin: boolean }) {
  const auth = await getSettings("auth")
  return auth.workspaceCreation === "anyone" || user.isSuperAdmin
}

/**
 * Create a workspace owned by `userId` (roles, owner membership, defaults via
 * `createOrganization`) and remember it as the user's last workspace.
 */
export async function createWorkspaceFor(opts: { userId: string; name: string; slug?: string; onboarded?: boolean }) {
  const org = await createOrganization({ name: opts.name, slug: opts.slug || undefined, ownerId: opts.userId })
  if (opts.onboarded) {
    await db.update(schema.organizations).set({ onboardingCompletedAt: new Date() }).where(eq(schema.organizations.id, org.id))
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, opts.userId), columns: { preferences: true } })
  await db
    .update(schema.users)
    .set({ preferences: { ...(user?.preferences ?? {}), lastOrgSlug: org.slug } })
    .where(eq(schema.users.id, opts.userId))
  return org
}

/** Load demo data into a workspace. Never throws — returns an error message instead. */
export async function loadDemoData(orgId: string, userId: string): Promise<{ ok: true; conversations: number } | { ok: false; error: string }> {
  try {
    const { seedDemoData } = await import("@/server/demo")
    const res = await seedDemoData(orgId, userId)
    return { ok: true, conversations: res.conversations }
  } catch (err) {
    console.error("[setup] demo data failed", err)
    return { ok: false, error: err instanceof Error ? err.message : "Demo data could not be loaded" }
  }
}

/* ----------------------------- One-time setup code ----------------------------- */

/** Unambiguous base32 (no 0/O, 1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 12

function setupCodePath() {
  return path.join(getDataDir(), "secrets", "setup-code")
}

function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/** "ABCDEFGHJKLM" → "ABCD-EFGH-JKLM" */
export function formatSetupCode(code: string) {
  return normalizeCode(code).match(/.{1,4}/g)?.join("-") ?? ""
}

/**
 * The one-time code that proves the person running /setup operates this
 * server. Stored in $DATA_DIR/secrets/setup-code (0600) so every app
 * container sharing the data volume agrees on it. Never sent to the client.
 */
export async function getOrCreateSetupCode(): Promise<string> {
  const file = setupCodePath()
  try {
    const existing = normalizeCode(await fsp.readFile(file, "utf8"))
    if (existing.length === CODE_LENGTH) return existing
  } catch {
    /* create below */
  }
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("")
  try {
    // wx: another process may have created it concurrently — then use theirs
    await fsp.writeFile(file, code, { mode: 0o600, flag: "wx" })
    return code
  } catch {
    const existing = normalizeCode(await fsp.readFile(file, "utf8"))
    if (existing.length === CODE_LENGTH) return existing
    await fsp.writeFile(file, code, { mode: 0o600 })
    return code
  }
}

export type SetupCodeCheck = { ok: true } | { ok: false; reason: "missing" | "invalid" | "rate_limited" }

/** Case- and dash-insensitive, constant-time check; 10 attempts per IP and hour. */
export async function verifySetupCode(input: string | null | undefined, ip: string | null): Promise<SetupCodeCheck> {
  const candidate = normalizeCode(input ?? "")
  if (!candidate) return { ok: false, reason: "missing" }
  const limit = await rateLimit(`setup-code:ip:${ip ?? "unknown"}`, 10, 3600)
  if (!limit.ok) return { ok: false, reason: "rate_limited" }
  const expected = await getOrCreateSetupCode()
  // hash both sides so the comparison is constant-time regardless of input length
  const digest = (v: string) => crypto.createHash("sha256").update(v).digest("hex")
  return safeEqual(digest(candidate), digest(expected)) ? { ok: true } : { ok: false, reason: "invalid" }
}

export async function clearSetupCode() {
  await fsp.rm(setupCodePath(), { force: true })
}

let lastBannerAt = 0

/**
 * Print the setup code to the server logs while the instance is unclaimed
 * (setup incomplete and no super admin). Called on server start
 * (src/instrumentation.ts) and whenever /setup renders — throttled to once a
 * minute so page views don't flood the logs. Never throws.
 */
export async function printSetupBanner(opts: { force?: boolean } = {}) {
  try {
    if (!opts.force && Date.now() - lastBannerAt < 60_000) return
    const [setup, hasSuperAdmin] = await Promise.all([getSettings("setup"), superAdminExists()])
    if (setup.completedAt || hasSuperAdmin) return
    const code = formatSetupCode(await getOrCreateSetupCode())
    lastBannerAt = Date.now()
    const url = `${getAppUrl()}/setup`
    const lines = [`Dispatch first-run setup code: ${code}`, `Open ${url} and enter this code`, "to create the owner account of this instance."]
    const width = Math.max(...lines.map((l) => l.length)) + 4
    console.log(
      ["", `╔${"═".repeat(width)}╗`, ...lines.map((l) => `║  ${l.padEnd(width - 4)}  ║`), `╚${"═".repeat(width)}╝`, ""].join("\n")
    )
  } catch (err) {
    console.warn("[dispatch] could not print the setup code:", err instanceof Error ? err.message : err)
  }
}

/* --------------------------------- Checks --------------------------------- */

export type SystemCheck = { ok: boolean; label: string; detail: string }

export async function checkDatabase(): Promise<SystemCheck & { latencyMs: number | null }> {
  const started = performance.now()
  try {
    await db.execute(sql`select 1`)
    const latencyMs = Math.round((performance.now() - started) * 10) / 10
    return { ok: true, label: "Database", detail: `PostgreSQL reachable · ${latencyMs} ms`, latencyMs }
  } catch (err) {
    return { ok: false, label: "Database", detail: err instanceof Error ? err.message : String(err), latencyMs: null }
  }
}

export async function checkDataDir(): Promise<SystemCheck & { path: string }> {
  let dir = ""
  try {
    dir = getDataDir()
    const probe = path.join(dir, `.write-test-${randomToken(6)}`)
    await fsp.writeFile(probe, "ok")
    await fsp.rm(probe, { force: true })
    return { ok: true, label: "Data directory", detail: `${dir} is writable`, path: dir }
  } catch (err) {
    return {
      ok: false,
      label: "Data directory",
      detail: `${dir || "DATA_DIR"} is not writable: ${err instanceof Error ? err.message : String(err)}`,
      path: dir,
    }
  }
}

export function checkDomain(): SystemCheck & { url: string; secure: boolean } {
  const url = getAppUrl()
  const secure = isSecureContext()
  const local = /\/\/(localhost|127\.0\.0\.1)/.test(url)
  return {
    ok: secure || local,
    label: "Public URL",
    detail: secure ? `${url} (HTTPS)` : local ? `${url} (local development)` : `${url} — HTTPS is strongly recommended`,
    url,
    secure,
  }
}

export async function runSetupChecks() {
  const [database, dataDir] = await Promise.all([checkDatabase(), checkDataDir()])
  return { database, dataDir, domain: checkDomain() }
}
