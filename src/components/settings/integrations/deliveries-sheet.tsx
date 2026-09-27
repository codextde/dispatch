"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronRight, Inbox, Loader2, RefreshCw, RotateCcw, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { LocalTime } from "@/components/app/local-time"
import { EmptyState, MicroLabel, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { CodeBlock, prettyJson } from "@/components/settings/integrations/code-block"
import { getWebhookDeliveries, redeliverWebhookDelivery, sendTestWebhook } from "@/server/workspace/actions/integrations"
import type { WebhookDeliveryRow, WebhookRow } from "@/server/workspace/queries/integrations"
import { cn } from "@/lib/utils"

export function DeliveryStatus({ d }: { d: Pick<WebhookDeliveryRow, "status" | "attempts"> }) {
  if (d.status === "success") return <StatusBadge tone="success">Delivered</StatusBadge>
  if (d.status === "failed") return <StatusBadge tone="danger">Failed</StatusBadge>
  return (
    <StatusBadge tone={d.attempts > 0 ? "warning" : "neutral"} pulse>
      {d.attempts > 0 ? "Retrying" : "Pending"}
    </StatusBadge>
  )
}

export function DeliveriesSheet({
  slug,
  webhook,
  open,
  onOpenChange,
}: {
  slug: string
  webhook: WebhookRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState<WebhookDeliveryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { pending, run } = useServerAction()
  const webhookId = webhook?.id

  const load = useCallback(async () => {
    if (!webhookId) return
    setLoading(true)
    try {
      const res = await getWebhookDeliveries({ slug, id: webhookId })
      if (res.ok) setRows(res.data)
      else toast.error(res.error)
    } finally {
      setLoading(false)
    }
  }, [slug, webhookId])

  useEffect(() => {
    if (!open || !webhookId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await getWebhookDeliveries({ slug, id: webhookId })
      if (cancelled) return
      setLoading(false)
      if (res.ok) setRows(res.data)
      else toast.error(res.error)
    })()
    return () => {
      cancelled = true
      setRows(null)
      setExpanded(null)
    }
  }, [open, slug, webhookId])

  // Poll while deliveries are pending so the status updates without manual refresh
  const hasPending = rows?.some((r) => r.status === "pending") ?? false
  useEffect(() => {
    if (!open || !hasPending) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [open, hasPending, load])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <MicroLabel>Webhook deliveries</MicroLabel>
          <SheetTitle className="text-base font-semibold tracking-tight">{webhook?.name}</SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">{webhook?.url}</SheetDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!webhook || pending}
              onClick={() =>
                webhook &&
                void run(() => sendTestWebhook({ slug, id: webhook.id }), {
                  success: (d) => (d.enabled ? "Test event queued" : "Test event queued — the endpoint is paused, so it won't be sent until you enable it"),
                  onSuccess: () => void load(),
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Send test event
            </Button>
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
              <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading deliveries…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Inbox />}
                title="No deliveries yet"
                description="Deliveries show up here as events happen. Send a test event to check your endpoint."
              />
            </div>
          ) : (
            <ul className="divide-y">
              <li className="hidden grid-cols-[7rem_1fr_4.5rem_4rem_7.5rem] gap-3 bg-surface/60 px-5 py-2 sm:grid">
                <MicroLabel>Status</MicroLabel>
                <MicroLabel>Event</MicroLabel>
                <MicroLabel>Code</MicroLabel>
                <MicroLabel>Tries</MicroLabel>
                <MicroLabel className="text-right">Time</MicroLabel>
              </li>
              {rows.map((d) => {
                const isOpen = expanded === d.id
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : d.id)}
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:grid-cols-[7rem_1fr_4.5rem_4rem_7.5rem]"
                    >
                      <span className="flex items-center gap-1.5">
                        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                        <DeliveryStatus d={d} />
                      </span>
                      <span className="order-3 col-span-2 truncate pl-5 font-mono text-[12px] sm:order-none sm:col-span-1 sm:pl-0">{d.event}</span>
                      <span className="hidden font-mono text-[12px] tabular-nums sm:block">
                        {d.responseStatus ?? <span className="text-muted-foreground">—</span>}
                      </span>
                      <span className="hidden tabular-nums sm:block">{d.attempts}</span>
                      <LocalTime date={d.createdAt} format="relative" titleFormat="datetime" className="text-right text-xs text-muted-foreground" />
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-3 border-t bg-surface/30 px-5 py-4">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-muted-foreground">Response</dt>
                            <dd className="font-mono">{d.responseStatus ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Attempts</dt>
                            <dd className="tabular-nums">{d.attempts}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Created</dt>
                            <dd>
                              <LocalTime date={d.createdAt} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{d.status === "pending" ? "Next attempt" : "Delivered"}</dt>
                            <dd>
                              <LocalTime date={d.status === "pending" ? d.nextAttemptAt : d.deliveredAt} />
                            </dd>
                          </div>
                        </dl>
                        <div className="flex flex-col gap-1.5">
                          <MicroLabel>Payload</MicroLabel>
                          <CodeBlock code={prettyJson(d.payload)} maxHeight={280} />
                        </div>
                        {d.responseBody && (
                          <div className="flex flex-col gap-1.5">
                            <MicroLabel>Response body</MicroLabel>
                            <CodeBlock code={prettyJson(d.responseBody)} maxHeight={200} />
                          </div>
                        )}
                        {d.status !== "pending" && webhook && (
                          <div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                void run(() => redeliverWebhookDelivery({ slug, id: webhook.id, deliveryId: d.id }), {
                                  success: "Delivery queued again",
                                  onSuccess: () => void load(),
                                })
                              }
                            >
                              <RotateCcw /> Redeliver
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
