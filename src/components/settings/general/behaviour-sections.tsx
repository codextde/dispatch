"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SectionFooter, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { updateBusinessHours, updateConversationBehaviour } from "@/server/workspace/actions/general"
import { cn } from "@/lib/utils"

function SaveFooter({ dirty, pending, onSave, onReset, hint }: { dirty: boolean; pending: boolean; onSave: () => void; onReset: () => void; hint?: React.ReactNode }) {
  return (
    <SectionFooter hint={hint}>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
          Reset
        </Button>
      )}
      <Button size="sm" disabled={!dirty || pending} onClick={onSave}>
        {pending && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </SectionFooter>
  )
}

type Behaviour = { reopenOnReply: boolean; closeOnReply: boolean; undoSendSeconds: number }

export function ConversationSection({ slug, initial }: { slug: string; initial: Behaviour }) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  return (
    <SettingsSection
      title="Conversations"
      description="Defaults for how conversations move through the workspace."
      footer={
        <SaveFooter
          dirty={dirty}
          pending={pending}
          onReset={() => setForm(saved)}
          onSave={() =>
            run(() => updateConversationBehaviour({ slug, ...form }), {
              success: "Conversation settings saved",
              onSuccess: () => setSaved(form),
            })
          }
        />
      }
    >
      <SettingsRows>
        <SettingsRow
          htmlFor="reopen"
          label="Reopen on customer reply"
          description="Move a closed conversation back to the inbox when the customer writes again."
        >
          <Switch id="reopen" checked={form.reopenOnReply} onCheckedChange={(v) => setForm({ ...form, reopenOnReply: v })} />
        </SettingsRow>
        <SettingsRow
          htmlFor="close-on-reply"
          label="Close when replying"
          description="Close conversations automatically after a teammate sends a reply."
        >
          <Switch id="close-on-reply" checked={form.closeOnReply} onCheckedChange={(v) => setForm({ ...form, closeOnReply: v })} />
        </SettingsRow>
        <SettingsRow
          htmlFor="undo-default"
          label="Undo send"
          description="Default delay before emails leave the outbox. Members can override it in their preferences."
        >
          <Select value={String(form.undoSendSeconds)} onValueChange={(v) => setForm({ ...form, undoSendSeconds: Number(v) })}>
            <SelectTrigger id="undo-default" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Off</SelectItem>
              {[5, 10, 15, 20, 30].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} seconds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsRows>
    </SettingsSection>
  )
}

type Hours = { enabled: boolean; days: number[]; start: string; end: string }

// Display order Monday → Sunday; values follow Date#getDay (0 = Sunday)
const DAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
]

export function BusinessHoursSection({ slug, initial, timezone }: { slug: string; initial: Hours; timezone: string }) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const invalid = form.enabled && (form.days.length === 0 || form.start >= form.end)

  return (
    <SettingsSection
      title="Business hours"
      description={`When your team is available, in the workspace timezone (${timezone.replace(/_/g, " ")}).`}
      action={<Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} aria-label="Business hours" />}
      footer={
        <SaveFooter
          dirty={dirty}
          pending={pending}
          onReset={() => setForm(saved)}
          hint={invalid ? <span className="text-destructive">Pick at least one day and an end time after the start.</span> : undefined}
          onSave={() => {
            if (invalid) return
            run(() => updateBusinessHours({ slug, ...form }), { success: "Business hours saved", onSuccess: () => setSaved(form) })
          }}
        />
      }
    >
      <div className={cn("flex flex-col gap-4", !form.enabled && "pointer-events-none opacity-50")} aria-disabled={!form.enabled}>
        <div role="group" aria-label="Working days" className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = form.days.includes(d.value)
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                aria-label={d.long}
                disabled={!form.enabled}
                onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d.value) : [...form.days, d.value] })}
                className={cn(
                  "h-8 w-12 rounded-lg border text-[13px] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "border-foreground/80 bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted dark:bg-input/30"
                )}
              >
                {d.short}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label htmlFor="bh-start" className="text-muted-foreground">
            From
          </label>
          <Input
            id="bh-start"
            type="time"
            className="w-32"
            value={form.start}
            disabled={!form.enabled}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
          />
          <label htmlFor="bh-end" className="text-muted-foreground">
            to
          </label>
          <Input
            id="bh-end"
            type="time"
            className="w-32"
            value={form.end}
            disabled={!form.enabled}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
          />
        </div>
      </div>
    </SettingsSection>
  )
}
