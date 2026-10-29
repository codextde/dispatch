"use client"

import { useEffect } from "react"
import Link from "next/link"
import { LogoMark } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useI18n()
  const it = locale === "it"
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark className="size-10" />
      <p className="mt-8 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{it ? "Si è verificato un errore" : "Something went wrong"}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-display sm:text-4xl">
        {it ? "Operazione non riuscita." : "That didn’t work."} <span className="text-quiet">{it ? "Riprova." : "Please try again."}</span>
      </h1>
      {error.digest && <p className="mt-4 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset} className="rounded-none px-5">
          {it ? "Riprova" : "Try again"}
        </Button>
        <Button asChild variant="outline" className="rounded-none px-5">
          <Link href="/login">{it ? "Torna alla posta in arrivo" : "Back to my inbox"}</Link>
        </Button>
      </div>
    </main>
  )
}
