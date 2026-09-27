import { NextResponse, type NextRequest } from "next/server"

/**
 * Edge of the app:
 *  - optimistic auth redirect for app areas (real checks happen in layouts/handlers)
 *  - refresh the long-lived session cookie on navigation so active devices
 *    stay signed in (the DB expiry of 1 year is authoritative)
 */
const SESSION_COOKIE = "dispatch_session"
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60
/** Mirrors getAppUrl() in src/server/env.ts (kept inline: proxy must stay dependency-free). */
function isHttpsDeployment() {
  const url = process.env.APP_URL || process.env.DOMAIN || ""
  if (!url) return false
  if (/^https:\/\//.test(url)) return true
  if (/^http:\/\//.test(url)) return false
  return !/^(localhost|127\.0\.0\.1)(:|$)/.test(url)
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

  const res = NextResponse.next()
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
