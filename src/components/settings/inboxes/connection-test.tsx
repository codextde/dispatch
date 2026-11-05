"use client"

import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import type { ConnectionTestResult } from "@/components/settings/inboxes/types"

type RowState = "idle" | "running" | "ok" | "error"

function Row({ label, detail, state, error, incoming }: { label: string; detail: string; state: RowState; error?: string; incoming: boolean }) {
  const { locale } = useI18n()
  const it = locale === "it"
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {state === "running" ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : state === "ok" ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : state === "error" ? (
          <XCircle className="size-4 text-destructive" />
        ) : (
          <CircleDashed className="size-4 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium">{label}</span>
          <span className="truncate font-mono text-[11.5px] text-muted-foreground">{detail}</span>
        </div>
        <p
          className={cn("mt-0.5 text-[13px] text-pretty text-muted-foreground", state === "error" && "text-destructive")}
          role={state === "error" ? "alert" : undefined}
        >
          {state === "running"
            ? it ? "Connessione in corso…" : "Connecting…"
            : state === "ok"
              ? incoming
                ? it ? "Connesso e autenticato." : "Connected and signed in."
                : it ? "Connesso e autenticato." : "Connected and authenticated."
              : state === "error"
                ? error
                : it ? "Non ancora testato." : "Not tested yet."}
        </p>
      </div>
    </li>
  )
}

/** IMAP + SMTP test status rows. */
export function ConnectionTestPanel({
  running,
  result,
  imapDetail,
  smtpDetail,
}: {
  running: boolean
  result: ConnectionTestResult | null
  imapDetail: string
  smtpDetail: string
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const state = (r: { ok: boolean } | undefined): RowState => (running ? "running" : !r ? "idle" : r.ok ? "ok" : "error")
  return (
    <ul className="divide-y rounded-lg border bg-card" aria-live="polite" aria-busy={running}>
      <Row
        label={it ? "Posta in arrivo (IMAP)" : "Incoming mail (IMAP)"}
        incoming
        detail={imapDetail}
        state={state(result?.imap)}
        error={result && !result.imap.ok ? result.imap.error : undefined}
      />
      <Row
        label={it ? "Posta in uscita (SMTP)" : "Outgoing mail (SMTP)"}
        incoming={false}
        detail={smtpDetail}
        state={state(result?.smtp)}
        error={result && !result.smtp.ok ? result.smtp.error : undefined}
      />
    </ul>
  )
}
