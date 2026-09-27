"use client"

import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConnectionTestResult } from "@/components/settings/inboxes/types"

type RowState = "idle" | "running" | "ok" | "error"

function Row({ label, detail, state, error }: { label: string; detail: string; state: RowState; error?: string }) {
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
            ? "Connecting…"
            : state === "ok"
              ? label.startsWith("Incoming")
                ? "Connected and signed in."
                : "Connected and authenticated."
              : state === "error"
                ? error
                : "Not tested yet."}
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
  const state = (r: { ok: boolean } | undefined): RowState => (running ? "running" : !r ? "idle" : r.ok ? "ok" : "error")
  return (
    <ul className="divide-y rounded-lg border bg-card" aria-live="polite" aria-busy={running}>
      <Row
        label="Incoming mail (IMAP)"
        detail={imapDetail}
        state={state(result?.imap)}
        error={result && !result.imap.ok ? result.imap.error : undefined}
      />
      <Row
        label="Outgoing mail (SMTP)"
        detail={smtpDetail}
        state={state(result?.smtp)}
        error={result && !result.smtp.ok ? result.smtp.error : undefined}
      />
    </ul>
  )
}
