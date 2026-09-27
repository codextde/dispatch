"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { format } from "date-fns"
import { CalendarDays, Clock, Settings2, UserRound, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { UserAvatar } from "@/components/app/user-avatar"
import { useOrg } from "@/components/app/org-provider"
import { memberName } from "@/lib/inbox/format"
import { combineDateTime, timePresets } from "@/lib/inbox/snooze"
import type { LabelSummary } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useNow } from "@/hooks/inbox/use-now"
import { useInbox } from "./inbox-provider"

type PopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
}

/* -------------------------------- Assignees -------------------------------- */

/**
 * Member picker. `value` = currently assigned ids; selecting toggles.
 * `partial` = ids assigned to only some of the selected conversations (bulk).
 */
export function AssigneePicker({
  value,
  partial = [],
  onToggle,
  open,
  onOpenChange,
  children,
  align = "end",
  side,
}: PopoverProps & { value: string[]; partial?: string[]; onToggle: (userId: string, assign: boolean) => void }) {
  const { members, meId } = useInbox()
  const { can } = useOrg()
  const canAssignOthers = can("conversations.assign")
  const sorted = useMemo(() => {
    const me = members.find((m) => m.id === meId)
    return [...(me ? [me] : []), ...members.filter((m) => m.id !== meId)]
  }, [members, meId])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Assign to…" autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>No teammates found.</CommandEmpty>
            <CommandGroup heading="Teammates">
              {sorted.map((m) => {
                const checked = value.includes(m.id)
                const disabled = m.id !== meId && !canAssignOthers
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.name ?? ""} ${m.email}`}
                    disabled={disabled}
                    data-checked={checked}
                    onSelect={() => onToggle(m.id, !checked)}
                  >
                    <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {memberName(m)}
                      {m.id === meId && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {partial.includes(m.id) && !checked && <span className="size-1.5 rounded-full bg-muted-foreground" aria-label="Some" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {value.length > 0 && canAssignOthers && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__unassign_all" onSelect={() => value.forEach((id) => onToggle(id, false))}>
                    <X /> Unassign everyone
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ---------------------------------- Labels --------------------------------- */

function flattenLabels(labels: LabelSummary[]) {
  const byParent = new Map<string | null, LabelSummary[]>()
  for (const l of labels) {
    const key = l.parentId && labels.some((p) => p.id === l.parentId) ? l.parentId : null
    byParent.set(key, [...(byParent.get(key) ?? []), l])
  }
  const out: { label: LabelSummary; depth: number; path: string }[] = []
  const walk = (parent: string | null, depth: number, path: string) => {
    for (const l of byParent.get(parent) ?? []) {
      const p = path ? `${path} / ${l.name}` : l.name
      out.push({ label: l, depth, path: p })
      walk(l.id, depth + 1, p)
    }
  }
  walk(null, 0, "")
  return out
}

export function LabelPicker({
  value,
  partial = [],
  onToggle,
  open,
  onOpenChange,
  children,
  align = "end",
  side,
}: PopoverProps & { value: string[]; partial?: string[]; onToggle: (labelId: string, add: boolean) => void }) {
  const { bootstrap, slug } = useInbox()
  const { can } = useOrg()
  const router = useRouter()
  const flat = useMemo(() => flattenLabels(bootstrap.labels), [bootstrap.labels])
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Apply labels…" autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>No labels found.</CommandEmpty>
            <CommandGroup>
              {flat.map(({ label: l, depth, path }) => {
                const checked = value.includes(l.id)
                return (
                  <CommandItem key={l.id} value={path} data-checked={checked} onSelect={() => onToggle(l.id, !checked)}>
                    <span style={{ paddingLeft: depth * 12 }} className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="truncate">{l.name}</span>
                      {l.visibility === "private" && <UserRound className="size-3 text-muted-foreground" aria-label="Private" />}
                    </span>
                    {partial.includes(l.id) && !checked && <span className="size-1.5 rounded-full bg-muted-foreground" aria-label="Some" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__manage_labels" onSelect={() => router.push(`/w/${slug}/settings/labels`)}>
                <Settings2 /> {can("labels.manage") ? "Manage labels" : "Personal labels"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ---------------------------------- Teams ---------------------------------- */

export function TeamPicker({ value, onSelect, open, onOpenChange, children, align = "end", side }: PopoverProps & { value: string | null; onSelect: (teamId: string | null) => void }) {
  const { bootstrap } = useInbox()
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Move to team…" autoFocus />
          <CommandList>
            <CommandEmpty>No teams found.</CommandEmpty>
            <CommandGroup>
              {bootstrap.teams.map((t) => (
                <CommandItem key={t.id} value={t.name} data-checked={value === t.id} onSelect={() => onSelect(t.id)}>
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </CommandItem>
              ))}
              <CommandItem value="__no_team" data-checked={value === null} onSelect={() => onSelect(null)}>
                <Users className="text-muted-foreground" /> No team
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------ Date & time -------------------------------- */

export function DateTimeForm({ onSubmit, submitLabel, initial }: { onSubmit: (date: Date) => void; submitLabel: string; initial?: Date }) {
  const start = initial ?? timePresets()[1]!.date
  const [day, setDay] = useState<Date | undefined>(start)
  const [time, setTime] = useState(format(start, "HH:mm"))
  const now = useNow()
  const value = day ? combineDateTime(day, time) : null
  const valid = !!value && value.getTime() > now + 60_000
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (value && valid) onSubmit(value)
      }}
    >
      <Calendar
        mode="single"
        selected={day}
        onSelect={setDay}
        disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
        className="mx-auto p-0"
      />
      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor="dt-time" className="text-xs text-muted-foreground">
            Time
          </Label>
          <Input id="dt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8" required />
        </div>
        <Button type="submit" size="sm" className="h-8" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
      {value && !valid && <p className="text-xs text-destructive">Pick a time in the future.</p>}
    </form>
  )
}

/* --------------------------------- Snooze ---------------------------------- */

export function SnoozePicker({
  snoozedUntil,
  onSnooze,
  open,
  onOpenChange,
  children,
  align = "end",
  side,
  title = "Snooze until…",
}: PopoverProps & { snoozedUntil?: string | null; onSnooze: (until: Date | null) => void; title?: string }) {
  const [custom, setCustom] = useState(false)
  const presets = useMemo(() => (open ? timePresets() : []), [open])
  const now = useNow()
  const snoozed = !!snoozedUntil && new Date(snoozedUntil).getTime() > now
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setCustom(false)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className={cn("p-0", custom ? "w-auto p-3" : "w-72")}>
        {custom ? (
          <DateTimeForm
            submitLabel="Snooze"
            onSubmit={(d) => {
              onSnooze(d)
              onOpenChange(false)
              setCustom(false)
            }}
          />
        ) : (
          <Command>
            <CommandList>
              <CommandGroup heading={title}>
                {presets.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.label}
                    onSelect={() => {
                      onSnooze(p.date)
                      onOpenChange(false)
                    }}
                  >
                    <Clock className="text-muted-foreground" />
                    <span className="flex-1">{p.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{p.hint}</span>
                  </CommandItem>
                ))}
                <CommandItem value="custom" onSelect={() => setCustom(true)}>
                  <CalendarDays className="text-muted-foreground" />
                  Pick date & time…
                </CommandItem>
              </CommandGroup>
              {snoozed && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="unsnooze"
                      onSelect={() => {
                        onSnooze(null)
                        onOpenChange(false)
                      }}
                    >
                      <X /> Unsnooze
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
