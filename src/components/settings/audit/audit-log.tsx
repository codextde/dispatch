"use client"

import { useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Loader2, ScrollText, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserAvatar } from "@/components/app/user-avatar"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { CopyButton } from "@/components/settings/copy-button"
import { EmptyState, MicroLabel, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { LocalTime } from "@/components/app/local-time"
import { auditActionLabel, auditActionTone, auditResourceLabel } from "@/components/settings/audit/action-labels"
import { cn } from "@/lib/utils"

export type AuditItem = {
  id: string
  action: string
  targetType: string | null
  targetId: string | null
  ip: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  actor: { id: string | null; name: string | null; email: string | null; avatarUrl: string | null }
}

type Facets = {
  actions: { action: string; count: number }[]
  actors: { id: string; name: string | null; email: string; avatarUrl: string | null }[]
}

type Filters = { actor?: string; action?: string; q?: string; from?: string; to?: string }

const SECTION_LABELS: Record<string, string> = {
  profile: "Name & timezone",
  logo: "Logo",
  conversations: "Conversation defaults",
  business_hours: "Business hours",
  access: "Joining the workspace",
  ai: "AI assistant",
}

function targetLabel(item: AuditItem): string | null {
  const m = item.metadata
  if (item.action === "workspace.slug_changed" && typeof m.from === "string" && typeof m.to === "string") return `/w/${m.from} → /w/${m.to}`
  if (typeof m.section === "string") return SECTION_LABELS[m.section] ?? m.section.replace(/_/g, " ")
  for (const key of ["email", "name", "title", "slug"] as const) {
    const v = m[key]
    if (typeof v === "string" && v) return v
  }
  if (!item.targetType) return null
  return `${item.targetType.replace(/_/g, " ")}${item.targetId ? ` · ${item.targetId.slice(0, 8)}` : ""}`
}

function actorLabel(item: AuditItem) {
  if (item.actor.name || item.actor.email) return item.actor.name || item.actor.email!
  return item.action.startsWith("billing.") ? "Stripe" : "System"
}

export function AuditLog({
  items,
  total,
  page,
  pages,
  pageSize,
  facets,
  filters,
}: {
  items: AuditItem[]
  total: number
  page: number
  pages: number
  pageSize: number
  facets: Facets
  filters: Filters
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [loading, startTransition] = useTransition()
  const [q, setQ] = useState(filters.q ?? "")
  const [open, setOpen] = useState<AuditItem | null>(null)

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!("page" in patch)) next.delete("page")
    const qs = next.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const actionOptions = useMemo<ComboOption[]>(() => {
    const resources = [...new Set(facets.actions.map((a) => a.action.split(".")[0]!))]
    return [
      ...resources.map((r) => ({ value: `${r}.*`, label: `All ${auditResourceLabel(r).toLowerCase()} events`, group: "Categories" })),
      ...facets.actions.map((a) => ({
        value: a.action,
        label: auditActionLabel(a.action),
        hint: String(a.count),
        group: auditResourceLabel(a.action.split(".")[0]!),
      })),
    ]
  }, [facets.actions])

  const actorOptions = useMemo<ComboOption[]>(
    () =>
      facets.actors.map((a) => ({
        value: a.id,
        label: a.name || a.email,
        hint: a.name ? a.email : undefined,
        icon: <UserAvatar name={a.name} email={a.email} src={a.avatarUrl} size="xs" />,
      })),
    [facets.actors]
  )

  const hasFilters = Boolean(filters.actor || filters.action || filters.q || filters.from || filters.to)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <form
          className="relative min-w-0 sm:w-64"
          onSubmit={(e) => {
            e.preventDefault()
            update({ q: q.trim() || undefined })
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search the audit log"
            placeholder="Search email, IP, details…"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => (q.trim() || undefined) !== filters.q && update({ q: q.trim() || undefined })}
          />
        </form>
        <Combobox
          options={actorOptions}
          value={filters.actor ?? null}
          onChange={(v) => update({ actor: v ?? undefined })}
          placeholder="Any member"
          searchPlaceholder="Search members…"
          clearable
          className="sm:w-48"
        />
        <Combobox
          options={actionOptions}
          value={filters.action ?? null}
          onChange={(v) => update({ action: v ?? undefined })}
          placeholder="Any event"
          searchPlaceholder="Search events…"
          clearable
          className="sm:w-56"
          contentClassName="min-w-72"
        />
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="From date"
            className="w-[9.5rem]"
            value={filters.from ?? ""}
            max={filters.to}
            onChange={(e) => update({ from: e.target.value || undefined })}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="To date"
            className="w-[9.5rem]"
            value={filters.to ?? ""}
            min={filters.from}
            onChange={(e) => update({ to: e.target.value || undefined })}
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("")
              startTransition(() => router.replace(pathname, { scroll: false }))
            }}
          >
            <X /> Clear
          </Button>
        )}
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground sm:ml-auto" aria-label="Loading" />}
      </div>

      <SettingsSection flush bodyClassName={cn("transition-opacity", loading && "opacity-60")}>
        {items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ScrollText />}
              title={hasFilters ? "No matching events" : "No events yet"}
              description={
                hasFilters ? "Try a different filter or date range." : "Security-relevant changes in this workspace will be recorded here."
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-40 pl-5">Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="pr-5 text-right">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    tabIndex={0}
                    className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none"
                    onClick={() => setOpen(item)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(item))}
                  >
                    <TableCell className="pl-5 text-[13px] whitespace-nowrap text-muted-foreground">
                      <LocalTime date={item.createdAt} titleFormat="datetime" />
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <UserAvatar name={item.actor.name} email={item.actor.email} src={item.actor.avatarUrl} size="xs" />
                        <span className="max-w-44 truncate text-[13px]">{actorLabel(item)}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={auditActionTone(item.action)}>{auditActionLabel(item.action)}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-[13px] text-muted-foreground">{targetLabel(item) ?? "—"}</TableCell>
                    <TableCell className="pr-5 text-right font-mono text-xs text-muted-foreground">{item.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Mobile list */}
            <ul className="divide-y md:hidden">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setOpen(item)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-muted/40">
                    <span className="flex items-center justify-between gap-2">
                      <StatusBadge tone={auditActionTone(item.action)}>{auditActionLabel(item.action)}</StatusBadge>
                      <LocalTime date={item.createdAt} format="relative" className="text-xs text-muted-foreground" />
                    </span>
                    <span className="flex items-center gap-2 text-[13px]">
                      <UserAvatar name={item.actor.name} email={item.actor.email} src={item.actor.avatarUrl} size="xs" />
                      <span className="truncate">{actorLabel(item)}</span>
                      {targetLabel(item) && <span className="truncate text-muted-foreground">→ {targetLabel(item)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-[13px] text-muted-foreground">
              <span className="tabular-nums">
                {first.toLocaleString("en-US")}–{last.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page <= 1 || loading}
                  onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : undefined })}
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">
                  {page} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page >= pages || loading}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </SettingsSection>

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-lg">
          {open && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{auditActionLabel(open.action)}</SheetTitle>
                <SheetDescription>
                  <LocalTime date={open.createdAt} />
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
                  <dt className="text-muted-foreground">Actor</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={open.actor.name} email={open.actor.email} src={open.actor.avatarUrl} size="xs" />
                    <span className="truncate">
                      {actorLabel(open)}
                      {open.actor.name && open.actor.email && <span className="text-muted-foreground"> · {open.actor.email}</span>}
                    </span>
                  </dd>
                  <dt className="text-muted-foreground">Event</dt>
                  <dd className="font-mono text-xs">{open.action}</dd>
                  {open.targetType && (
                    <>
                      <dt className="text-muted-foreground">Target</dt>
                      <dd className="min-w-0 font-mono text-xs break-all">
                        {open.targetType}
                        {open.targetId && ` · ${open.targetId}`}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">IP address</dt>
                  <dd className="font-mono text-xs">{open.ip ?? "—"}</dd>
                  {open.userAgent && (
                    <>
                      <dt className="text-muted-foreground">User agent</dt>
                      <dd className="text-xs break-words text-muted-foreground">{open.userAgent}</dd>
                    </>
                  )}
                </dl>
                <div className="flex min-h-0 flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <MicroLabel>Metadata</MicroLabel>
                    <CopyButton value={JSON.stringify(open.metadata, null, 2)} variant="ghost" size="icon-xs" message="Metadata copied" />
                  </div>
                  <pre className="scrollbar-thin max-h-[50vh] overflow-auto rounded-lg border bg-surface p-3 font-mono text-[12px] leading-relaxed">
                    {JSON.stringify(open.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
