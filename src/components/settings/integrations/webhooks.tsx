"use client"

import { useState } from "react"
import { History, KeyRound, MoreHorizontal, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { LocalTime } from "@/components/app/local-time"
import { EmptyState, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { DeliveriesSheet } from "@/components/settings/integrations/deliveries-sheet"
import { SecretReveal } from "@/components/settings/integrations/secret-reveal"
import { eventsSummary, WebhookDialog } from "@/components/settings/integrations/webhook-dialog"
import {
  deleteWebhook,
  rollWebhookSecret,
  sendTestWebhook,
  setWebhookEnabled,
} from "@/server/workspace/actions/integrations"
import type { WebhookRow } from "@/server/workspace/queries/integrations"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

function HealthBadge({ w, t, it }: { w: WebhookRow; t: (key: any) => string; it: boolean }) {
  if (!w.enabled) return <StatusBadge tone="neutral">{t("paused")}</StatusBadge>
  if (w.lastStatus === null) return <StatusBadge tone="neutral">{t("noDeliveries")}</StatusBadge>
  if (w.lastStatus >= 200 && w.lastStatus < 300 && w.failureCount === 0) return <StatusBadge tone="success">{t("healthy")}</StatusBadge>
  return (
    <StatusBadge tone={w.failureCount >= 3 ? "danger" : "warning"}>
      {w.failureCount > 0 ? `${it ? "Non riuscite" : "Failing"} · ${w.failureCount}` : `${it ? "Ultimo" : "Last"} ${w.lastStatus || (it ? "errore" : "error")}`}
    </StatusBadge>
  )
}

export function WebhooksSection({ slug, webhooks, events }: { slug: string; webhooks: WebhookRow[]; events: readonly string[] }) {
  const { t, locale } = useI18n()
  const it = locale === "it"
  const [dialog, setDialog] = useState<{ open: boolean; webhook: WebhookRow | null }>({ open: false, webhook: null })
  const [deliveries, setDeliveries] = useState<{ open: boolean; hook: WebhookRow | null }>({ open: false, hook: null })
  // Keep the target while the dialog animates out; `open` drives visibility
  const [deleting, setDeleting] = useState<{ open: boolean; hook: WebhookRow | null }>({ open: false, hook: null })
  const [rolling, setRolling] = useState<{ open: boolean; hook: WebhookRow | null }>({ open: false, hook: null })
  const [rolledSecret, setRolledSecret] = useState<string | null>(null)
  const { run } = useServerAction()

  const openCreate = () => setDialog({ open: true, webhook: null })

  return (
    <SettingsSection
      id="webhooks"
      title={t("webhooks")}
      description={t("webhooksDescription")}
      action={
        <Button size="sm" onClick={openCreate}>
          <Plus /> {t("addEndpoint")}
        </Button>
      }
      flush
    >
      {webhooks.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Webhook />}
            title={t("noWebhookEndpoints")}
            description={it ? "Ricevi notifiche quando vengono create, assegnate o chiuse conversazioni, quando arrivano messaggi e altro ancora." : "Get notified when conversations are created, assigned or closed, messages arrive, and more."}
          >
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus /> {t("addFirstEndpoint")}
            </Button>
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {webhooks.map((w) => (
            <li key={w.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface",
                    w.enabled ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <Webhook className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{w.name}</span>
                    <HealthBadge w={w} t={t} it={it} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground" title={w.url}>
                    {w.url}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default rounded border bg-surface px-1.5 py-px font-mono text-[11px]">{eventsSummary(w.events).replace("All events", it ? "Tutti gli eventi" : "All events")}</span>
                      </TooltipTrigger>
                      {w.events.length > 2 && !w.events.includes("*") && (
                        <TooltipContent className="max-w-xs font-mono text-[11px]">{w.events.join(", ")}</TooltipContent>
                      )}
                    </Tooltip>
                    <span>
                      {w.lastDeliveredAt ? (
                        <>
                          {t("lastDelivery")} <LocalTime date={w.lastDeliveredAt} format="relative" titleFormat="datetime" />
                        </>
                      ) : (
                        t("neverDelivered")
                      )}
                    </span>
                    {w.deliveries24h > 0 && (
                      <span className="tabular-nums">
                        {w.deliveries24h} {it ? "nelle ultime 24 h" : "in 24h"}{w.failed24h > 0 && <span className="text-destructive"> · {w.failed24h} {it ? "non riusciti" : "failed"}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pl-11 sm:pl-0">
                <Button variant="ghost" size="sm" onClick={() => setDeliveries({ open: true, hook: w })}>
                  <History /> {t("deliveries")}
                </Button>
                <Switch
                  checked={w.enabled}
                  aria-label={w.enabled ? (it ? `Metti in pausa ${w.name}` : `Pause ${w.name}`) : (it ? `Attiva ${w.name}` : `Enable ${w.name}`)}
                  onCheckedChange={(v) =>
                    void run(() => setWebhookEnabled({ slug, id: w.id, enabled: v }), { success: v ? (it ? "Webhook attivato" : "Webhook enabled") : (it ? "Webhook messo in pausa" : "Webhook paused") })
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={it ? `Azioni per ${w.name}` : `Actions for ${w.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setDialog({ open: true, webhook: w })}>
                      <Pencil /> {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void run(() => sendTestWebhook({ slug, id: w.id }), {
                          success: (d) => (d.enabled ? (it ? "Evento di prova in coda" : "Test event queued") : (it ? "Evento di prova in coda: attiva l’endpoint per inviarlo." : "Test event queued — enable the endpoint to send it")),
                        })
                      }
                    >
                      <Send /> {t("sendTestEvent")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeliveries({ open: true, hook: w })}>
                      <History /> {t("viewDeliveries")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRolling({ open: true, hook: w })}>
                      <KeyRound /> {t("rollSecret")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting({ open: true, hook: w })}>
                      <Trash2 /> {t("deleteForever")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      <WebhookDialog
        slug={slug}
        events={events}
        open={dialog.open}
        webhook={dialog.webhook}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />

      <DeliveriesSheet
        slug={slug}
        webhook={deliveries.hook}
        open={deliveries.open}
        onOpenChange={(open) => setDeliveries((d) => ({ ...d, open }))}
      />

      <ConfirmDialog
        open={deleting.open}
        onOpenChange={(open) => setDeleting((d) => ({ ...d, open }))}
        title={it ? `Eliminare “${deleting.hook?.name ?? ""}”?` : `Delete “${deleting.hook?.name ?? ""}”?`}
        description={it ? "L’endpoint smetterà subito di ricevere eventi e la cronologia degli invii verrà eliminata." : "The endpoint stops receiving events immediately and its delivery history is deleted."}
        confirmLabel={it ? "Elimina endpoint" : "Delete endpoint"}
        destructive
        onConfirm={async () => {
          const hook = deleting.hook
          if (!hook) return
          const res = await run(() => deleteWebhook({ slug, id: hook.id }), { success: it ? "Webhook eliminato" : "Webhook deleted" })
          return res.ok
        }}
      />

      <ConfirmDialog
        open={rolling.open}
        onOpenChange={(open) => setRolling((r) => ({ ...r, open }))}
        title={it ? "Generare un nuovo segreto di firma?" : "Roll signing secret?"}
        description={it ? "Verrà generato un nuovo segreto e quello attuale smetterà subito di funzionare. Aggiorna subito la configurazione dell’endpoint." : "A new secret is generated and the current one stops working immediately. Update your endpoint right after rolling."}
        confirmLabel={it ? "Genera nuovo segreto" : "Roll secret"}
        onConfirm={async () => {
          const hook = rolling.hook
          if (!hook) return
          const res = await run(() => rollWebhookSecret({ slug, id: hook.id }), {
            success: it ? "Nuovo segreto di firma generato" : "New signing secret generated",
            onSuccess: (d) => setRolledSecret(d.secret),
          })
          return res.ok
        }}
      />

      <Dialog open={rolledSecret !== null} onOpenChange={(open) => !open && setRolledSecret(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{it ? "Nuovo segreto di firma" : "New signing secret"}</DialogTitle>
            <DialogDescription>{it ? "Da ora gli invii saranno firmati con questo segreto." : "Deliveries from now on are signed with this secret."}</DialogDescription>
          </DialogHeader>
          {rolledSecret && <SecretReveal value={rolledSecret} />}
          <DialogFooter>
            <Button onClick={() => setRolledSecret(null)}>{it ? "Fatto" : "Done"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
