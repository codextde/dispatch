"use client"

import { useI18n } from "@/lib/i18n"

/** Amber banner shown on auth-area pages while an admin impersonates a user. */
export function ImpersonationBanner({ email }: { email: string }) {
  const { locale } = useI18n()
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-medium text-black">
      {locale === "it" ? <>Stai impersonando {email}.</> : <>You are impersonating {email}.</>}
      <form action="/admin/impersonate/stop" method="post">
        <button className="underline underline-offset-2">{locale === "it" ? "Interrompi impersonificazione" : "Stop impersonating"}</button>
      </form>
    </div>
  )
}
