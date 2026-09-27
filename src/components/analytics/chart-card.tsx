"use client"

import * as React from "react"
import { useState } from "react"
import { ChartLine, Table2 } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/**
 * Card for one chart with an optional table view (every chart has a
 * table twin so values never depend on hover or color).
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
  className,
  action,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Legend shown under the title (charts with 2+ series) */
  legend?: React.ReactNode
  /** Table view of the same data */
  table?: React.ReactNode
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  const [view, setView] = useState<"chart" | "table">("chart")
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]", className)}>
      <header className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-pretty text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={view}
              onValueChange={(v) => v && setView(v as "chart" | "table")}
              aria-label="View"
            >
              <ToggleGroupItem value="chart" aria-label="Chart view" className="px-2">
                <ChartLine />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view" className="px-2">
                <Table2 />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      </header>
      {legend && view === "chart" && <div className="px-5 pt-3">{legend}</div>}
      <div className="min-w-0 flex-1 px-3 pt-3 pb-4 sm:px-5">{view === "table" && table ? table : children}</div>
    </section>
  )
}

/** Legend row: short line or square key + label in text color. */
export function Legend({ items }: { items: { label: string; color: string; shape?: "line" | "square" }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("shrink-0", i.shape === "square" ? "size-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full")}
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/** Compact scrollable table used for chart table views. */
export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: { key: string; label: string; align?: "left" | "right" }[]
  rows: Record<string, React.ReactNode>[]
  caption: string
}) {
  return (
    <div className="max-h-[260px] overflow-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-3 py-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase",
                  c.align === "right" ? "text-right" : "text-left"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-1.5 tabular-nums", c.align === "right" ? "text-right" : "text-left")}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
