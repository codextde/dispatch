"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { useI18n, localizeError } from "@/lib/i18n"

/**
 * Result banner after returning from an OAuth connect flow
 * (`?connected=…` or `?error=…` on the inbox list pages).
 */
export function ConnectResultBanner({ connected, error }: { connected?: string; error?: string }) {
  const { locale } = useI18n()
  const it = locale === "it"
  if (error) {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="text-pretty">
          <span className="font-medium">{it ? "Impossibile collegare la casella." : "The mailbox couldn&apos;t be connected."}</span>{" "}
          <span className="text-muted-foreground">{localizeError(error, locale).slice(0, 300)}</span>
        </p>
      </div>
    )
  }
  if (connected) {
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[13px]">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-pretty">
          <span className="font-medium">{it ? "Casella collegata." : "Mailbox connected."}</span>{" "}
          <span className="text-muted-foreground">{it ? "La prima sincronizzazione è iniziata: le nuove conversazioni appariranno presto nella posta in arrivo." : "The first sync has started — new conversations appear in the inbox shortly."}</span>
        </p>
      </div>
    )
  }
  return null
}
