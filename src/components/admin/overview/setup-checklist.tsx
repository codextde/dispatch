"use client"

import Link from "next/link"
import { ArrowRight, Check, CircleDashed, Minus } from "lucide-react"
import type { ChecklistItem } from "@/server/admin/overview"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

/** Instance readiness checklist; every row links to the page that fixes it. */
export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const required = items.filter((i) => i.state !== "optional")
  const done = required.filter((i) => i.state === "done").length
  const pct = required.length ? Math.round((done / required.length) * 100) : 100
  return (
    <div>
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-muted-foreground">
            {it ? `${done} di ${required.length} elementi essenziali pronti` : `${done} of ${required.length} essentials ready`}
          </span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={it ? "Avanzamento configurazione" : "Setup progress"}
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="-mx-2 space-y-px">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group flex items-start gap-3 rounded-md px-2 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  item.state === "done" && "border-transparent bg-brand text-brand-foreground",
                  item.state === "todo" && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                  item.state === "optional" && "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {item.state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : item.state === "todo" ? (
                  <CircleDashed className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {it ? ({ "Email delivery": "Invio email", Billing: "Fatturazione", "Google & Microsoft": "Google e Microsoft", "Attachment storage": "Archiviazione allegati", "Background worker": "Worker in background" }[item.label] ?? item.label) : item.label}
                  <span className="sr-only">
                    {item.state === "done" ? (it ? "(completato)" : "(done)") : item.state === "todo" ? (it ? "(richiede attenzione)" : "(needs attention)") : (it ? "(facoltativo)" : "(optional)")}
                  </span>
                  {item.state === "optional" && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{it ? "Facoltativo" : "Optional"}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{it ? translateChecklistDescription(item.key, item.description) : item.description}</span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function translateChecklistDescription(key: string, value: string) {
  if (key === "email") return value.startsWith("Sending via") ? value.replace("Sending via", "Invio tramite") : "I codici di accesso e gli inviti vengono stampati solo nei log del server."
  if (key === "billing") return ({ "Not needed — the instance runs in private mode.": "Non necessaria: l’istanza è in modalità privata.", "Stripe subscriptions are active for hosted workspaces.": "Gli abbonamenti Stripe sono attivi per i workspace ospitati.", "Add the Stripe secret key and create the product & price.": "Aggiungi la chiave segreta Stripe e crea prodotto e prezzo.", "Enable Stripe billing to charge hosted workspaces.": "Attiva la fatturazione Stripe per addebitare i workspace ospitati." }[value] ?? value)
  if (key === "oauth") return value.startsWith("Optional") ? "Facoltativo: permette ai team di collegare Gmail e Outlook con un clic." : value.replace("OAuth apps are configured.", "Le app OAuth sono configurate.").replace("OAuth app is configured.", "L’app OAuth è configurata.")
  if (key === "storage") return value.startsWith("S3-compatible bucket") ? value.replace("S3-compatible bucket", "Bucket compatibile con S3") : value === "S3 is selected but bucket or credentials are missing." ? "S3 è selezionato, ma mancano il bucket o le credenziali." : "Disco locale nel volume dei dati. Passa a S3 per configurazioni con più nodi."
  if (key === "worker") return ({ "Online — syncing inboxes and running jobs.": "Online: sincronizza le caselle ed esegue le attività.", "Offline — no heartbeat in the last 90 seconds.": "Offline: nessun segnale negli ultimi 90 secondi.", "Has not reported yet. Start the worker container.": "Nessun segnale ricevuto. Avvia il container worker." }[value] ?? value)
  return value
}
