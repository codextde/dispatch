"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { formatCount, formatDuration } from "@/components/analytics/format"
import type { InboxStat, TeammateStat } from "@/server/workspace/queries/analytics"
import { cn } from "@/lib/utils"

type Column<T> = {
  key: string
  label: string
  /** Value used for sorting (null sorts last) */
  sortValue: (row: T) => number | string | null
  render: (row: T) => React.ReactNode
  align?: "left" | "right"
  className?: string
}

function SortableTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  caption,
  empty,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  initialSort: { key: string; dir: "asc" | "desc" }
  caption: string
  empty: string
}) {
  const [sort, setSort] = useState(initialSort)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a)
      const vb = col.sortValue(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb)
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [columns, rows, sort])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            {columns.map((c) => {
              const active = sort.key === c.key
              const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("px-3 py-2 first:pl-5 last:pr-5", c.align === "right" ? "text-right" : "text-left", c.className)}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) =>
                        s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.align === "right" ? "desc" : "asc" }
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active && "text-foreground",
                      c.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {c.label}
                    <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-surface/60">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 first:pl-5 last:pr-5",
                      c.align === "right" ? "text-right tabular-nums" : "text-left",
                      c.className
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function Zeroable({ n }: { n: number }) {
  return <span className={cn(n === 0 && "text-muted-foreground")}>{formatCount(n)}</span>
}

function Duration({ s }: { s: number | null }) {
  return <span className={cn(s === null && "text-muted-foreground")}>{formatDuration(s)}</span>
}

function TableCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
      <header className="px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-[13px] text-pretty text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  )
}

export function TeammatesTable({ rows }: { rows: TeammateStat[] }) {
  const columns = useMemo<Column<TeammateStat>[]>(
    () => [
      {
        key: "name",
        label: "Teammate",
        sortValue: (r) => (r.name || r.email).toLowerCase(),
        render: (r) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={r.name} email={r.email} src={r.avatarUrl} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.name || r.email}</span>
              {r.name && <span className="block truncate text-xs text-muted-foreground">{r.email}</span>}
            </span>
          </span>
        ),
        className: "min-w-[200px]",
      },
      { key: "assigned", label: "Assigned", align: "right", sortValue: (r) => r.assigned, render: (r) => <Zeroable n={r.assigned} /> },
      { key: "replies", label: "Replies", align: "right", sortValue: (r) => r.replies, render: (r) => <Zeroable n={r.replies} /> },
      { key: "closed", label: "Closed", align: "right", sortValue: (r) => r.closed, render: (r) => <Zeroable n={r.closed} /> },
      {
        key: "frt",
        label: "First response",
        align: "right",
        sortValue: (r) => r.medianFirstResponse,
        render: (r) => <Duration s={r.medianFirstResponse} />,
      },
    ],
    []
  )
  return (
    <TableCard title="Teammates" description="Assignments, replies and closes in this period. First response is the median for conversations they answered first.">
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.userId}
        initialSort={{ key: "replies", dir: "desc" }}
        caption="Teammate performance"
        empty="No teammates match these filters."
      />
    </TableCard>
  )
}

export function InboxesTable({ rows }: { rows: InboxStat[] }) {
  const columns = useMemo<Column<InboxStat>[]>(
    () => [
      {
        key: "name",
        label: "Inbox",
        sortValue: (r) => r.name.toLowerCase(),
        render: (r) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
              style={{ backgroundColor: r.color }}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
            </span>
          </span>
        ),
        className: "min-w-[200px]",
      },
      { key: "received", label: "Received", align: "right", sortValue: (r) => r.received, render: (r) => <Zeroable n={r.received} /> },
      { key: "replies", label: "Replies", align: "right", sortValue: (r) => r.replies, render: (r) => <Zeroable n={r.replies} /> },
      {
        key: "frt",
        label: "First response",
        align: "right",
        sortValue: (r) => r.medianFirstResponse,
        render: (r) => <Duration s={r.medianFirstResponse} />,
      },
      { key: "open", label: "Open now", align: "right", sortValue: (r) => r.open, render: (r) => <Zeroable n={r.open} /> },
      { key: "closed", label: "Closed", align: "right", sortValue: (r) => r.closed, render: (r) => <Zeroable n={r.closed} /> },
    ],
    []
  )
  return (
    <TableCard title="Inboxes" description="Volume and responsiveness per shared inbox in this period.">
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.accountId}
        initialSort={{ key: "received", dir: "desc" }}
        caption="Inbox performance"
        empty="No shared inboxes match these filters."
      />
    </TableCard>
  )
}
