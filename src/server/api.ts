import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { ZodError, type ZodType } from "zod"
import { db, schema } from "@/server/db"
import { AuthError, computeLock, loadOrgContext, type OrgContext } from "@/server/authz"
import { hashToken } from "@/server/crypto"
import { getAppUrl } from "@/server/env"
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session"

/**
 * Route handler helpers for the JSON API (`/api/...`).
 *
 * Authentication: session cookie (browser) or `Authorization: Bearer dsp_...`
 * (workspace API keys created in Settings → API). Cookie-authenticated
 * mutations must come from our own origin (CSRF protection).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown
  ) {
    super(message)
  }
}

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init)
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status)
  if (err instanceof AuthError) return json({ error: { code: err.code, message: err.message } }, err.status)
  if (err instanceof ZodError) {
    return json({ error: { code: "validation_error", message: "Invalid request", details: err.issues } }, 400)
  }
  console.error("[api] unhandled error", err)
  return json({ error: { code: "internal_error", message: "Something went wrong" } }, 500)
}

type Handler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>

/** Wrap a route handler with uniform error handling. */
export function route<P = Record<string, string>>(fn: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, "Invalid JSON body", "invalid_json")
  }
  return schema.parse(body)
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Reject cross-site cookie-authenticated mutations. */
export function assertSameOrigin(req: Request) {
  if (!MUTATING.has(req.method)) return
  const fetchSite = req.headers.get("sec-fetch-site")
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "Cross-site request blocked", "csrf")
  }
  const origin = req.headers.get("origin")
  if (origin) {
    const allowed = new Set([new URL(getAppUrl()).origin])
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
    if (host) {
      allowed.add(`https://${host}`)
      allowed.add(`http://${host}`)
    }
    if (!allowed.has(origin)) throw new ApiError(403, "Cross-site request blocked", "csrf")
  }
}

export type ApiContext = OrgContext & { via: "session" | "api_key"; apiKeyId?: string }

/**
 * Authenticate a request for workspace `slug`. Accepts session cookies and
 * API keys (API keys are bound to one workspace and act as their creator).
 */
export async function requireApiOrg(req: NextRequest, slug: string): Promise<ApiContext> {
  const authz = req.headers.get("authorization")
  if (authz?.startsWith("Bearer ")) {
    const token = authz.slice(7).trim()
    const key = await db.query.apiKeys.findFirst({
      where: and(
        eq(schema.apiKeys.keyHash, hashToken(token)),
        isNull(schema.apiKeys.revokedAt),
        or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, new Date()))
      ),
    })
    if (!key || !key.userId) throw new ApiError(401, "Invalid API key", "unauthenticated")
    const rows = await db
      .select({ org: schema.organizations, membership: schema.memberships, role: schema.roles, user: schema.users })
      .from(schema.organizations)
      .innerJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.organizations.id), eq(schema.memberships.userId, key.userId)))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.organizations.id, key.orgId), eq(schema.organizations.slug, slug)))
      .limit(1)
    const row = rows[0]
    if (!row || row.membership.status !== "active" || row.user.status !== "active") {
      throw new ApiError(401, "Invalid API key", "unauthenticated")
    }
    void db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, key.id)).catch(() => {})
    const perms = new Set(row.role.permissions)
    // Optional scope restriction: key scopes intersect role permissions
    const effective = key.scopes.length ? new Set(key.scopes.filter((s) => perms.has(s))) : perms
    return {
      session: {
        id: `api:${key.id}`,
        userId: row.user.id,
        tokenHash: "",
        ip: null,
        userAgent: null,
        deviceLabel: "API key",
        impersonatorId: null,
        createdAt: key.createdAt,
        lastUsedAt: new Date(),
        expiresAt: key.expiresAt ?? new Date(Date.now() + 86_400_000),
      },
      user: row.user,
      org: row.org,
      membership: row.membership,
      role: row.role,
      permissions: effective,
      locked: await computeLock(row.org),
      via: "api_key",
      apiKeyId: key.id,
    }
  }

  assertSameOrigin(req)
  const s = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!s) throw new ApiError(401, "Not signed in", "unauthenticated")
  const ctx = await loadOrgContext(slug)
  if (!ctx) throw new ApiError(404, "Workspace not found", "not_found")
  return { ...ctx, via: "session" }
}

/** Session-only auth for non-workspace endpoints (e.g. /api/me). */
export async function requireApiUser(req: NextRequest) {
  assertSameOrigin(req)
  const s = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!s) throw new ApiError(401, "Not signed in", "unauthenticated")
  return s
}

export async function requireApiSuperAdmin(req: NextRequest) {
  const s = await requireApiUser(req)
  if (!s.user.isSuperAdmin) throw new ApiError(403, "Forbidden", "forbidden")
  return s
}
