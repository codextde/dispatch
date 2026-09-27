import { NextResponse, type NextRequest } from "next/server"

/**
 * Edge of the app:
 *  - optimistic auth redirect for app areas (real checks happen in layouts/handlers)
 *  - refresh the long-lived session cookie on navigation so active devices
 *    stay signed in (the DB expiry of 1 year is authoritative)
 *  - per-request CSP nonce: Next.js reads it from the request's CSP header and
 *    applies it to its own scripts; `x-nonce` exposes it to the root layout
 *    for other inline scripts (next-themes)
 */
const SESSION_COOKIE = "dispatch_session"
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60
const isDev = process.env.NODE_ENV !== "production"

/** Mirrors getAppUrl() in src/server/env.ts (kept inline: proxy must stay dependency-free). */
function isHttpsDeployment() {
  const url = process.env.APP_URL || process.env.DOMAIN || ""
  if (!url) return false
  if (/^https:\/\//.test(url)) return true
  if (/^http:\/\//.test(url)) return false
  return !/^(localhost|127\.0\.0\.1)(:|$)/.test(url)
}

/**
 * Content Security Policy. Scripts need the per-request nonce ('strict-dynamic'
 * lets them load their chunks). Email bodies render in sandboxed iframes
 * without script execution; remote images there are governed by the sanitizer.
 */
function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""} https://api.stripe.com`,
    "frame-src 'self' blob: https://js.stripe.com https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com https://login.microsoftonline.com",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

const PROTECTED = [/^\/w\//, /^\/admin(\/|$)/, /^\/onboarding(\/|$)/]

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value

  if (!token && PROTECTED.some((re) => re.test(pathname))) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("Content-Security-Policy", csp)
  const isDocument = req.headers.get("sec-fetch-dest") === "document"
  if (token && isDocument) {
    const secure = isHttpsDeployment() || req.nextUrl.protocol === "https:"
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE })
  }
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|api/).*)"],
}
