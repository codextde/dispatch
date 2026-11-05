import "server-only"
import { cookies, headers } from "next/headers"
import type { Locale } from "@/lib/i18n"
import { getCurrentSession } from "@/server/auth/session"

/**
 * Locale for the current request. Same resolution as the root layout: the signed-in user's
 * language first, then the locale cookie, then the browser's Accept-Language header.
 */
export async function requestLocale(): Promise<Locale> {
  const session = await getCurrentSession()
  const acceptLanguage = (await headers()).get("accept-language") ?? ""
  const preferredCookie = (await cookies()).get("dispatch-locale")?.value
  const it =
    session?.user.locale === "it" ||
    (!session && (preferredCookie === "it" || (!preferredCookie && acceptLanguage.toLowerCase().startsWith("it"))))
  return it ? "it" : "en"
}

/** Page title in the request's language, for use in `generateMetadata`. */
export async function pageTitle(en: string, it: string): Promise<string> {
  return (await requestLocale()) === "it" ? it : en
}
