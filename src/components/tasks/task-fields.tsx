"use client"

import { useState } from "react"
import { addDays, differenceInCalendarDays, format, isToday, isTomorrow, isYesterday, nextMonday } from "date-fns"
import { CalendarDays, Check, CircleDashed, Users, UserRound, X } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/app/user-avatar"
import { cn } from "@/lib/utils"
import { dueOn } from "./quick-add"
import type { TaskMember, TaskStatus, TaskTeam } from "./use-tasks"

/* --------------------------------- Status --------------------------------- */

export const STATUS_META: Record<TaskStatus, { label: string; short: string }> = {
  todo: { label: "To do", short: "To do" },
  in_progress: { label: "In progress", short: "Doing" },
  done: { label: "Done", short: "Done" },
}
export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"]

/** Linear-style status glyph: empty ring, half ring, filled check. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  if (status === "done") {
    return (
      <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-brand", className)} aria-hidden>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M5 8.2 7 10.2 11 6" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === "in_progress") {
    return (
      <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-amber-500", className)} aria-hidden>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function StatusMenu({
  value,
  onChange,
  disabled,
  children,
  align = "start",
}: {
  value: TaskStatus
  onChange: (s: TaskStatus) => void
  disabled?: boolean
  children: React.ReactNode
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {STATUS_ORDER.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
            <StatusIcon status={s} />
            {STATUS_META[s].label}
            {value === s && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ---------------------------------- Due ----------------------------------- */

export function dueState(dueAt: string | null, status?: TaskStatus): "none" | "overdue" | "today" | "soon" | "later" {
  if (!dueAt) return "none"
  const d = new Date(dueAt)
  const diff = differenceInCalendarDays(d, new Date())
  if (diff < 0) return status === "done" ? "later" : "overdue"
  if (diff === 0) return "today"
  if (diff <= 2) return "soon"
  return "later"
}

export function formatDue(dueAt: string | Date | null, opts: { long?: boolean } = {}) {
  if (!dueAt) return "No due date"
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  if (isYesterday(d)) return "Yesterday"
  const diff = differenceInCalendarDays(d, new Date())
  if (diff > 0 && diff < 7) return format(d, opts.long ? "EEEE" : "EEE")
  return format(d, d.getFullYear() === new Date().getFullYear() ? (opts.long ? "EEE, MMM d" : "MMM d") : "MMM d, yyyy")
}

export function DueBadge({ dueAt, status, className }: { dueAt: string | null; status?: TaskStatus; className?: string }) {
  if (!dueAt) return null
  const state = dueState(dueAt, status)
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium tabular-nums",
        state === "overdue" && "bg-red-500/10 text-red-600 dark:text-red-400",
        state === "today" && "bg-amber-500/12 text-amber-700 dark:text-amber-300",
        (state === "soon" || state === "later") && "text-muted-foreground",
        status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40",
        className
      )}
      title={format(new Date(dueAt), "PPPP")}
    >
      <CalendarDays className="size-3" aria-hidden />
      {formatDue(dueAt)}
    </span>
  )
}

export function DuePicker({
  value,
  onChange,
  children,
  align = "start",
  disabled,
}: {
  value: string | null
  onChange: (iso: string | null) => void
  children: React.ReactNode
  align?: "start" | "end" | "center"
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value) : undefined
  const pick = (d: Date | null) => {
    onChange(d ? dueOn(d).toISOString() : null)
    setOpen(false)
  }
  const today = new Date()
  const quick = [
    { label: "Today", date: today, hint: format(today, "EEE") },
    { label: "Tomorrow", date: addDays(today, 1), hint: format(addDays(today, 1), "EEE") },
    { label: "Next week", date: nextMonday(today), hint: format(nextMonday(today), "MMM d") },
  ]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex flex-col gap-px border-b p-1">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => pick(q.date)}
              className="flex h-8 items-center justify-between rounded-md px-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent"
            >
              {q.label}
              <span className="text-xs text-muted-foreground">{q.hint}</span>
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <X className="size-3.5" /> Remove due date
            </button>
          )}
        </div>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => d && pick(d)}
          weekStartsOn={1}
          className="bg-transparent"
        />
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------- Assignee -------------------------------- */

export function AssigneePicker({
  members,
  value,
  onChange,
  meId,
  children,
  align = "start",
  disabled,
  restrictToMe,
}: {
  members: TaskMember[]
  value: string | null
  onChange: (userId: string | null) => void
  meId: string
  children: React.ReactNode
  align?: "start" | "end" | "center"
  disabled?: boolean
  /** Members without tasks.manage may only assign themselves */
  restrictToMe?: boolean
}) {
  const [open, setOpen] = useState(false)
  const me = members.find((m) => m.id === meId)
  const others = members.filter((m) => m.id !== meId)
  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Assign to…" />
          <CommandList>
            <CommandEmpty>No teammate found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="unassigned no one" onSelect={() => pick(null)}>
                <span className="flex size-5 items-center justify-center rounded-full border border-dashed">
                  <UserRound className="size-3 text-muted-foreground" />
                </span>
                Unassigned
                {value === null && <Check className="ml-auto" />}
              </CommandItem>
              {me && (
                <CommandItem value={`me ${me.name ?? ""} ${me.email}`} onSelect={() => pick(me.id)}>
                  <UserAvatar name={me.name} email={me.email} src={me.avatarUrl} size="xs" />
                  <span className="truncate">{me.name || me.email}</span>
                  <span className="text-xs text-muted-foreground">(you)</span>
                  {value === me.id && <Check className="ml-auto" />}
                </CommandItem>
              )}
            </CommandGroup>
            {!restrictToMe && others.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Teammates">
                  {others.map((m) => (
                    <CommandItem key={m.id} value={`${m.name ?? ""} ${m.email}`} onSelect={() => pick(m.id)}>
                      <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />
                      <span className="truncate">{m.name || m.email}</span>
                      {value === m.id && <Check className="ml-auto" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function AssigneeAvatar({ assignee, size = "xs" }: { assignee: TaskMember | { id: string; name: string | null; email: string; avatarUrl: string | null } | null; size?: "xs" | "sm" }) {
  if (!assignee) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground",
          size === "xs" ? "size-5" : "size-6"
        )}
        aria-label="Unassigned"
      >
        <UserRound className="size-3" />
      </span>
    )
  }
  return <UserAvatar name={assignee.name} email={assignee.email} src={assignee.avatarUrl} size={size} />
}

/* ---------------------------------- Team ---------------------------------- */

export function TeamMenu({
  teams,
  value,
  onChange,
  children,
  align = "start",
  disabled,
}: {
  teams: TaskTeam[]
  value: string | null
  onChange: (teamId: string | null) => void
  children: React.ReactNode
  align?: "start" | "end"
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <CircleDashed className="text-muted-foreground" />
          No team
          {value === null && <Check className="ml-auto" />}
        </DropdownMenuItem>
        {teams.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onChange(t.id)}>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
            {t.name}
            {value === t.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        {teams.length === 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> No teams yet
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
