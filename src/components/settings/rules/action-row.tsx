"use client"

import { useId, useState } from "react"
import { ArrowDown, ArrowUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { RESPONSE_VARIABLES, RichTextEditor } from "@/components/settings/rich-text-editor"
import { ACTION_DEFS, RULE_LIMITS, SNOOZE_PRESETS } from "@/components/settings/rules/definitions"
import type { ActionDraft } from "@/components/settings/rules/drafts"
import { ACTION_ICONS } from "@/components/settings/rules/rule-icons"
import { cn } from "@/lib/utils"

export type ActionOptions = {
  labels: ComboOption[]
  members: ComboOption[]
  teams: ComboOption[]
  responses: ComboOption[]
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  )
}

const UNITS = [
  { value: "minutes", label: "minutes", size: 1 },
  { value: "hours", label: "hours", size: 60 },
  { value: "days", label: "days", size: 1440 },
  { value: "weeks", label: "weeks", size: 10080 },
] as const
type Unit = (typeof UNITS)[number]["value"]

function splitMinutes(minutes: number): { amount: string; unit: Unit } {
  for (const u of [...UNITS].reverse()) {
    if (minutes >= u.size && minutes % u.size === 0) return { amount: String(minutes / u.size), unit: u.value }
  }
  return { amount: String(minutes || ""), unit: "minutes" }
}

function SnoozeInput({ minutes, onChange, invalid }: { minutes: number; onChange: (m: number) => void; invalid: boolean }) {
  const initial = splitMinutes(minutes)
  const [amount, setAmount] = useState(initial.amount)
  const [unit, setUnit] = useState<Unit>(initial.unit)
  const uid = useId()

  const emit = (a: string, u: Unit) => {
    const n = Number(a)
    const size = UNITS.find((x) => x.value === u)!.size
    onChange(Number.isFinite(n) && n > 0 ? Math.round(n * size) : 0)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`${uid}-amount`} className="shrink-0 text-[13px] text-muted-foreground">
          Snooze for
        </label>
        <Input
          id={`${uid}-amount`}
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          aria-invalid={invalid}
          onChange={(e) => {
            setAmount(e.target.value)
            emit(e.target.value, unit)
          }}
          className="w-20 tabular-nums"
        />
        <Select
          value={unit}
          onValueChange={(v) => {
            setUnit(v as Unit)
            emit(amount, v as Unit)
          }}
        >
          <SelectTrigger className="w-28" aria-label="Unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SNOOZE_PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            onClick={() => {
              const s = splitMinutes(p.minutes)
              setAmount(s.amount)
              setUnit(s.unit)
              onChange(p.minutes)
            }}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              minutes === p.minutes && "border-brand/50 bg-brand-soft text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ActionRow({
  draft,
  index,
  count,
  errors,
  options,
  onChange,
  onRemove,
  onMove,
}: {
  draft: ActionDraft
  index: number
  count: number
  errors: Record<string, string>
  options: ActionOptions
  onChange: (patch: Partial<ActionDraft>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const uid = useId()
  const def = ACTION_DEFS[draft.type]
  const Icon = ACTION_ICONS[draft.type]
  const p = `actions.${index}`
  const err = (k: string) => errors[`${p}.${k}`]
  const anyError = Object.keys(errors).some((k) => k.startsWith(`${p}.`))

  let body: React.ReactNode = null
  switch (draft.type) {
    case "add_label":
    case "remove_label":
      body = (
        <div className="flex flex-col gap-1.5">
          <Combobox
            options={options.labels}
            value={draft.labelId || null}
            onChange={(v) => onChange({ labelId: v ?? "" })}
            placeholder={options.labels.length ? "Select label" : "No labels available"}
            searchPlaceholder="Search labels…"
            aria-invalid={Boolean(err("labelId"))}
            className="sm:max-w-sm"
          />
          <ErrorText>{err("labelId")}</ErrorText>
        </div>
      )
      break
    case "assign":
      body = (
        <div className="flex flex-col gap-1.5">
          <Combobox
            options={options.members}
            value={draft.userId || null}
            onChange={(v) => onChange({ userId: v ?? "" })}
            placeholder="Select teammate"
            searchPlaceholder="Search people…"
            aria-invalid={Boolean(err("userId"))}
            className="sm:max-w-sm"
          />
          <ErrorText>{err("userId")}</ErrorText>
        </div>
      )
      break
    case "assign_team":
      body = (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Combobox
              options={options.teams}
              value={draft.teamId || null}
              onChange={(v) => onChange({ teamId: v ?? "" })}
              placeholder={options.teams.length ? "Select team" : "No teams yet — create one in Settings → Teams"}
              searchPlaceholder="Search teams…"
              aria-invalid={Boolean(err("teamId"))}
              className="sm:max-w-sm"
            />
            <ErrorText>{err("teamId")}</ErrorText>
          </div>
          <label htmlFor={`${uid}-balance`} className="flex items-start gap-3">
            <Switch id={`${uid}-balance`} checked={draft.balance} onCheckedChange={(v) => onChange({ balance: v })} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Balance workload</span>
              <span className="block text-xs text-muted-foreground">
                Also assign a teammate using the team’s assignment strategy (round robin, least busy or random).
              </span>
            </span>
          </label>
        </div>
      )
      break
    case "snooze":
      body = (
        <div className="flex flex-col gap-1.5">
          <SnoozeInput minutes={draft.minutes} onChange={(m) => onChange({ minutes: m })} invalid={Boolean(err("minutes"))} />
          <ErrorText>{err("minutes")}</ErrorText>
        </div>
      )
      break
    case "auto_reply":
      body = (
        <div className="flex flex-col gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={draft.replyMode}
            onValueChange={(v) => v && onChange({ replyMode: v as ActionDraft["replyMode"] })}
            aria-label="Reply content"
          >
            <ToggleGroupItem value="custom" className="px-3 text-xs">
              Custom message
            </ToggleGroupItem>
            <ToggleGroupItem value="canned" className="px-3 text-xs">
              Canned response
            </ToggleGroupItem>
          </ToggleGroup>
          {draft.replyMode === "canned" ? (
            <div className="flex flex-col gap-1.5">
              <Combobox
                options={options.responses}
                value={draft.cannedResponseId || null}
                onChange={(v) => onChange({ cannedResponseId: v ?? "" })}
                placeholder={options.responses.length ? "Select canned response" : "No canned responses yet"}
                searchPlaceholder="Search responses…"
                aria-invalid={Boolean(err("cannedResponseId"))}
                className="sm:max-w-sm"
              />
              <ErrorText>{err("cannedResponseId")}</ErrorText>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-subject`} className="text-[13px] font-medium">
                  Subject <span className="text-xs font-normal text-muted-foreground">Optional — defaults to “Re: original subject”</span>
                </label>
                <Input
                  id={`${uid}-subject`}
                  value={draft.subject}
                  maxLength={RULE_LIMITS.subject}
                  onChange={(e) => onChange({ subject: e.target.value })}
                  aria-invalid={Boolean(err("subject"))}
                />
                <ErrorText>{err("subject")}</ErrorText>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Message</span>
                <RichTextEditor
                  value={draft.body}
                  onChange={(html) => onChange({ body: html })}
                  placeholder="Hi {{contact.first_name}}, thanks for reaching out…"
                  variables={RESPONSE_VARIABLES}
                  minHeight={120}
                  aria-invalid={Boolean(err("body"))}
                />
                <ErrorText>{err("body")}</ErrorText>
              </div>
            </>
          )}
        </div>
      )
      break
    case "forward":
      body = (
        <div className="flex flex-col gap-1.5">
          <Input
            type="email"
            aria-label="Forward to"
            placeholder="accounting@acme.com"
            value={draft.to}
            onChange={(e) => onChange({ to: e.target.value })}
            aria-invalid={Boolean(err("to"))}
            className="sm:max-w-sm"
          />
          <ErrorText>{err("to")}</ErrorText>
        </div>
      )
      break
    case "comment":
      body = (
        <div className="flex flex-col gap-1.5">
          <Textarea
            aria-label="Comment"
            placeholder="Heads up: this customer is on the Enterprise plan."
            value={draft.body}
            maxLength={RULE_LIMITS.comment}
            onChange={(e) => onChange({ body: e.target.value })}
            aria-invalid={Boolean(err("body"))}
            className="min-h-20"
          />
          <p className="text-xs text-muted-foreground">Posted as an internal note — customers never see it.</p>
          <ErrorText>{err("body")}</ErrorText>
        </div>
      )
      break
    case "webhook":
      body = (
        <div className="flex flex-col gap-1.5">
          <Input
            type="url"
            aria-label="Webhook URL"
            placeholder="https://example.com/hooks/dispatch"
            value={draft.url}
            spellCheck={false}
            onChange={(e) => onChange({ url: e.target.value })}
            aria-invalid={Boolean(err("url"))}
            className="font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">Dispatch sends a POST request with the conversation and message as JSON.</p>
          <ErrorText>{err("url")}</ErrorText>
        </div>
      )
      break
  }

  return (
    <div className={cn("rounded-lg border bg-background", anyError && "border-destructive/50")} data-invalid={anyError ? true : undefined}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{def.label}</div>
          {!body && <div className="truncate text-xs text-muted-foreground">{def.description}</div>}
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${def.label} up`}
            className="text-muted-foreground"
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${def.label} down`}
            className="text-muted-foreground"
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label={`Remove ${def.label}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        </div>
      </div>
      {body && <div className="border-t px-3 py-3">{body}</div>}
      {!body && err("type") && (
        <div className="px-3 pb-2">
          <ErrorText>{err("type")}</ErrorText>
        </div>
      )}
    </div>
  )
}
