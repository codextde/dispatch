"use client"

import * as React from "react"
import { useMemo, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { CalendarRange, Loader2, RotateCcw } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { UserAvatar } from "@/components/app/user-avatar"
import { useIsMobile } from "@/hooks/use-mobile"
import { addDaysYmd, formatRangeLabel, parseYmd, toYmd } from "@/components/analytics/format"
import { cn } from "@/lib/utils"

export type AnalyticsFilterState = {
  range: "7" | "30" | "90" | "custom"
  /** Inclusive local dates of the active window */
  from: string
  to: string
  inbox: string | null
  team: string | null
  user: string | null
}

export type AnalyticsFilterOptions = {
  accounts: { id: string; name: string; email: string; color: string }[]
  teams: { id: string; name: string; color: string }[]
  members: { id: string; name: string | null; email: string; avatarUrl: string | null }[]
}

const DEFAULT_RANGE = "30"
const MAX_DAYS = 366

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
      style={{ backgroundColor: color }}
    />
  )
}

/**
 * Filter row + the report below it. Filters live in the URL; changing one
 * re-renders the server page in a transition while the previous report stays
 * visible (dimmed) — no skeleton flash.
 */
export function AnalyticsView({
  filters,
  options,
  today,
  children,
}: {
  filters: AnalyticsFilterState
  options: AnalyticsFilterOptions
  /** Today's date in the workspace timezone (YYYY-MM-DD) */
  today: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const navigate = (patch: Partial<AnalyticsFilterState>) => {
    const f = { ...filters, ...patch }
    const p = new URLSearchParams()
    if (f.range !== DEFAULT_RANGE) p.set("range", f.range)
    if (f.range === "custom") {
      p.set("from", f.from)
      p.set("to", f.to)
    }
    if (f.inbox) p.set("inbox", f.inbox)
    if (f.team) p.set("team", f.team)
    if (f.user) p.set("user", f.user)
    const qs = p.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const inboxOptions = useMemo<ComboOption[]>(
    () => options.accounts.map((a) => ({ value: a.id, label: a.name, hint: a.email, icon: <Dot color={a.color} /> })),
    [options.accounts]
  )
  const teamOptions = useMemo<ComboOption[]>(
    () => options.teams.map((t) => ({ value: t.id, label: t.name, icon: <Dot color={t.color} /> })),
    [options.teams]
  )
  const memberOptions = useMemo<ComboOption[]>(
    () =>
      options.members.map((m) => ({
        value: m.id,
        label: m.name || m.email,
        hint: m.name ? m.email : undefined,
        icon: <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />,
      })),
    [options.members]
  )

  const hasFilters = Boolean(filters.inbox || filters.team || filters.user || filters.range !== DEFAULT_RANGE)

  return (
    <>
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center" role="search" aria-label="Report filters">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={filters.range}
            onValueChange={(v) => {
              if (v && v !== "custom") navigate({ range: v as AnalyticsFilterState["range"] })
            }}
            aria-label="Date range"
            className="bg-card"
          >
            {(["7", "30", "90"] as const).map((r) => (
              <ToggleGroupItem key={r} value={r} className="h-8 px-3 font-mono text-xs" aria-label={`Last ${r} days`}>
                {r}D
              </ToggleGroupItem>
            ))}
            <CustomRange
              active={filters.range === "custom"}
              from={filters.from}
              to={filters.to}
              today={today}
              onApply={(from, to) => navigate({ range: "custom", from, to })}
            />
          </ToggleGroup>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {formatRangeLabel(filters.from, addDaysYmd(filters.to, 1))}
          </span>
          {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Updating" />}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:ml-auto lg:flex lg:items-center">
          <Combobox
            options={inboxOptions}
            value={filters.inbox}
            onChange={(v) => navigate({ inbox: v })}
            placeholder="All inboxes"
            searchPlaceholder="Search inboxes…"
            emptyText="No shared inboxes."
            clearable
            className="bg-card lg:w-44"
          />
          <Combobox
            options={teamOptions}
            value={filters.team}
            onChange={(v) => navigate({ team: v })}
            placeholder="All teams"
            searchPlaceholder="Search teams…"
            emptyText="No teams yet."
            clearable
            className="bg-card lg:w-40"
          />
          <Combobox
            options={memberOptions}
            value={filters.user}
            onChange={(v) => navigate({ user: v })}
            placeholder="All teammates"
            searchPlaceholder="Search teammates…"
            clearable
            className="bg-card lg:w-48"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground lg:self-auto"
            onClick={() => navigate({ range: DEFAULT_RANGE, inbox: null, team: null, user: null })}
          >
            <RotateCcw /> Reset
          </Button>
        )}
      </div>
      <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-55")}>
        {children}
      </div>
    </>
  )
}

function CustomRange({
  active,
  from,
  to,
  today,
  onApply,
}: {
  active: boolean
  from: string
  to: string
  today: string
  onApply: (from: string, to: string) => void
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>({ from: parseYmd(from), to: parseYmd(to) })
  const todayDate = parseYmd(today)
  const days = range?.from && range.to ? Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) + 1 : 0

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setRange({ from: parseYmd(from), to: parseYmd(to) })
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-state={active ? "on" : "off"}
          aria-pressed={active}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-r-lg border border-l-0 border-input bg-transparent px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            active && "bg-muted"
          )}
        >
          <CalendarRange className="size-3.5" />
          Custom
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={isMobile ? 1 : 2}
          defaultMonth={range?.from ? new Date(range.from.getFullYear(), range.from.getMonth() - (isMobile ? 0 : 1), 1) : undefined}
          selected={range}
          onSelect={setRange}
          disabled={{ after: todayDate }}
          max={MAX_DAYS}
          className="p-3"
        />
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {range?.from && range.to ? `${days} ${days === 1 ? "day" : "days"}` : "Pick a start and end date"}
          </span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!range?.from}
              onClick={() => {
                if (!range?.from) return
                onApply(toYmd(range.from), toYmd(range.to ?? range.from))
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
