"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { FormField } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { SecretReveal } from "@/components/settings/integrations/secret-reveal"
import { createWebhook, updateWebhook } from "@/server/workspace/actions/integrations"
import type { WebhookRow } from "@/server/workspace/queries/integrations"
import { cn } from "@/lib/utils"

export const EVENT_DESCRIPTIONS: Record<string, string> = {
  "conversation.created": "A new conversation starts (incoming email or new thread).",
  "conversation.closed": "A conversation is closed.",
  "conversation.reopened": "A closed conversation is reopened.",
  "conversation.assigned": "Assignees of a conversation change.",
  "conversation.labeled": "A label is added to a conversation.",
  "message.received": "An email arrives in a connected inbox.",
  "message.sent": "A reply or new email is sent.",
  "comment.created": "A teammate adds an internal comment.",
  "task.created": "A task is created.",
  "task.completed": "A task is marked as done.",
}

export function eventsSummary(events: string[]) {
  if (events.length === 0 || events.includes("*")) return "All events"
  if (events.length <= 2) return events.join(", ")
  return `${events.slice(0, 2).join(", ")} +${events.length - 2}`
}

type Props = {
  slug: string
  events: readonly string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit mode when given */
  webhook?: WebhookRow | null
}

export function WebhookDialog({ slug, events: allEvents, open, onOpenChange, webhook }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && <WebhookForm key={webhook?.id ?? "new"} slug={slug} allEvents={allEvents} webhook={webhook} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function WebhookForm({
  slug,
  allEvents,
  webhook,
  onDone,
}: {
  slug: string
  allEvents: readonly string[]
  webhook?: WebhookRow | null
  onDone: () => void
}) {
  const editing = Boolean(webhook)
  const { pending, run, fieldErrors } = useServerAction()
  const [name, setName] = useState(webhook?.name ?? "")
  const [url, setUrl] = useState(webhook?.url ?? "")
  const [enabled, setEnabled] = useState(webhook?.enabled ?? true)
  const initialAll = !webhook || webhook.events.length === 0 || webhook.events.includes("*")
  const [all, setAll] = useState(initialAll)
  const [selected, setSelected] = useState<string[]>(initialAll ? [] : webhook!.events)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [secret, setSecret] = useState<string | null>(null)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = "Give the endpoint a name"
    const u = url.trim()
    if (!u) e.url = "Enter the endpoint URL"
    else {
      try {
        const parsed = new URL(u)
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") e.url = "The URL must use https://"
      } catch {
        e.url = "Enter a valid URL, e.g. https://example.com/webhooks/dispatch"
      }
    }
    if (!all && selected.length === 0) e.events = "Pick at least one event"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    const payload = { slug, name: name.trim(), url: url.trim(), events: all ? ["*"] : selected }
    if (webhook) {
      void run(() => updateWebhook({ ...payload, id: webhook.id, enabled } as Parameters<typeof updateWebhook>[0]), {
        success: "Webhook updated",
        onSuccess: onDone,
      })
    } else {
      void run(() => createWebhook(payload as Parameters<typeof createWebhook>[0]), {
        success: "Webhook created",
        onSuccess: (data) => setSecret(data.secret),
      })
    }
  }

  if (secret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Every delivery is signed with this secret in the <code className="font-mono text-[12px]">X-Dispatch-Signature</code> header. Store it
            in your endpoint&apos;s configuration.
          </DialogDescription>
        </DialogHeader>
        <SecretReveal value={secret} hint="You can roll a new secret any time from the endpoint's menu." />
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    )
  }

  const err = (k: string) => errors[k] ?? fieldErrors[k]

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{editing ? "Edit webhook" : "Add webhook endpoint"}</DialogTitle>
        <DialogDescription>Dispatch sends a signed JSON POST request to this URL when the selected events happen.</DialogDescription>
      </DialogHeader>

      <FormField label="Name" htmlFor="wh-name" error={err("name")}>
        <Input
          id="wh-name"
          autoFocus={!editing}
          maxLength={80}
          value={name}
          aria-invalid={Boolean(err("name"))}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production CRM"
        />
      </FormField>

      <FormField
        label="Endpoint URL"
        htmlFor="wh-url"
        error={err("url")}
        description="Must use https://. Respond with a 2xx status within 10 seconds."
      >
        <Input
          id="wh-url"
          type="url"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-[13px]"
          value={url}
          aria-invalid={Boolean(err("url"))}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks/dispatch"
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium">Events</span>
        <div className="overflow-hidden rounded-lg border">
          <label className="flex cursor-pointer items-start gap-2.5 border-b bg-surface/50 px-3 py-2.5">
            <Checkbox className="mt-0.5" checked={all} onCheckedChange={(v) => setAll(v === true)} />
            <span>
              <span className="block text-[13px] font-medium">All events</span>
              <span className="block text-xs text-muted-foreground">Including event types added in future versions.</span>
            </span>
          </label>
          <div className={cn("scrollbar-thin grid max-h-64 gap-0 overflow-y-auto", all && "pointer-events-none opacity-50")}>
            {allEvents.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
                <Checkbox
                  className="mt-0.5"
                  disabled={all}
                  checked={all || selected.includes(ev)}
                  onCheckedChange={(v) => setSelected((s) => (v === true ? [...new Set([...s, ev])] : s.filter((x) => x !== ev)))}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-[12px]">{ev}</span>
                  {EVENT_DESCRIPTIONS[ev] && <span className="block text-xs text-muted-foreground">{EVENT_DESCRIPTIONS[ev]}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
        {err("events") && (
          <p role="alert" className="text-xs text-destructive">
            {err("events")}
          </p>
        )}
      </div>

      {editing && (
        <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium">Enabled</span>
            <span className="block text-xs text-muted-foreground">Paused endpoints receive no deliveries.</span>
          </span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Add endpoint"}
        </Button>
      </DialogFooter>
    </form>
  )
}
