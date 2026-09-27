"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { ActionBadge } from "@/components/admin/audit/action-badge"
import { cn } from "@/lib/utils"

/** Audit event pre-formatted on the server (dates as strings → no hydration drift). */
export type AuditRowView = {
  id: string
  iso: string
  time: string
  ago: string
  orgId: string | null
  orgName: string | null
  actorId: string | null
  actorEmail: string | null
  actorName: string | null
  actorAvatarUrl: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  targetHref: string | null
  ip: string | null
  userAgent: string | null
  metadataJson: string | null
}

function Actor({ row }: { row: AuditRowView }) {
  if (!row.actorEmail) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] text-muted-foreground">
          SYS
        </span>
        <span className="text-muted-foreground">System</span>
      </span>
    )
  }
  const body = (
    <>
      <UserAvatar name={row.actorName} email={row.actorEmail} src={row.actorAvatarUrl} size="sm" />
      <span className="min-w-0 truncate">{row.actorEmail}</span>
    </>
  )
  return row.actorId ? (
    <Link
      href={`/admin/users/${row.actorId}`}
      className="flex min-w-0 items-center gap-2 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2">{body}</span>
  )
}

function Target({ row }: { row: AuditRowView }) {
  if (!row.targetType && !row.targetId) return <span className="text-muted-foreground">—</span>
  const label = row.targetLabel ?? (row.targetId ? `${row.targetId.slice(0, 8)}${row.targetId.length > 8 ? "…" : ""}` : "")
  const inner = (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{row.targetType ?? "target"}</span>
      <span className="truncate text-[13px]" title={row.targetId ?? undefined}>
        {label}
      </span>
    </span>
  )
  return row.targetHref ? (
    <Link
      href={row.targetHref}
      className="block min-w-0 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {inner}
    </Link>
  ) : (
    inner
  )
}

function Details({ row }: { row: AuditRowView }) {
  return (
    <div className="grid gap-3 text-[13px] md:grid-cols-[1fr_minmax(0,2fr)]">
      <dl className="grid content-start gap-2">
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Event id</dt>
          <dd className="font-mono text-xs break-all">{row.id}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Time</dt>
          <dd>
            <time dateTime={row.iso}>{row.iso}</time>
          </dd>
        </div>
        {row.targetId && (
          <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Target id</dt>
            <dd className="font-mono text-xs break-all">{row.targetId}</dd>
          </div>
        )}
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">IP address</dt>
          <dd className="font-mono text-xs">{row.ip ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">User agent</dt>
          <dd className="text-xs break-words text-muted-foreground">{row.userAgent ?? "—"}</dd>
        </div>
      </dl>
      <div className="min-w-0">
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Metadata</div>
        {row.metadataJson ? (
          <pre className="scrollbar-thin max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed">
            {row.metadataJson}
          </pre>
        ) : (
          <p className="text-muted-foreground">No metadata recorded.</p>
        )}
      </div>
    </div>
  )
}

export function AuditTable({ rows }: { rows: AuditRowView[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      {/* Desktop / tablet: table */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                {["", "Time", "Actor", "Action", "Target", "Workspace", "IP"].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="h-9 border-b border-border bg-surface/60 px-3 text-left align-middle font-mono text-[10.5px] font-normal uppercase tracking-wider whitespace-nowrap text-muted-foreground first:w-10 first:pr-0 first:pl-2 last:pr-4"
                  >
                    {h || <span className="sr-only">Details</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = open.has(row.id)
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn("cursor-pointer transition-colors hover:bg-muted/40", expanded && "bg-muted/40")}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a,button")) return
                        toggle(row.id)
                      }}
                    >
                      <td className="w-10 border-b border-border py-2.5 pr-0 pl-2 align-middle">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          aria-expanded={expanded}
                          aria-controls={`audit-details-${row.id}`}
                          aria-label={expanded ? "Hide details" : "Show details"}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                        </button>
                      </td>
                      <td className="border-b border-border px-3 py-2.5 align-middle whitespace-nowrap">
                        <time dateTime={row.iso} title={row.time} className="block text-[13px]">
                          {row.ago}
                        </time>
                        <span className="block text-[11px] text-muted-foreground">{row.time}</span>
                      </td>
                      <td className="max-w-[220px] border-b border-border px-3 py-2.5 align-middle">
                        <Actor row={row} />
                      </td>
                      <td className="max-w-[230px] border-b border-border px-3 py-2.5 align-middle">
                        <ActionBadge action={row.action} />
                      </td>
                      <td className="max-w-[180px] border-b border-border px-3 py-2.5 align-middle">
                        <Target row={row} />
                      </td>
                      <td className="max-w-[160px] border-b border-border px-3 py-2.5 align-middle">
                        {row.orgId ? (
                          <Link href={`/admin/workspaces/${row.orgId}`} className="block truncate text-[13px] hover:underline">
                            {row.orgName ?? row.orgId.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Instance</span>
                        )}
                      </td>
                      <td className="max-w-[140px] truncate border-b border-border py-2.5 pr-4 pl-3 align-middle font-mono text-xs text-muted-foreground">
                        {row.ip ?? "—"}
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`audit-details-${row.id}`} className="bg-surface/60">
                        <td colSpan={7} className="border-b border-border px-4 py-4">
                          <Details row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
        {rows.map((row) => {
          const expanded = open.has(row.id)
          return (
            <li key={row.id} className="p-3">
              <button
                type="button"
                onClick={() => toggle(row.id)}
                aria-expanded={expanded}
                className="flex w-full items-start gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-center justify-between gap-2">
                    <ActionBadge action={row.action} />
                    <time dateTime={row.iso} className="shrink-0 text-[11px] text-muted-foreground">
                      {row.ago}
                    </time>
                  </span>
                  <span className="block truncate text-[13px]">{row.actorEmail ?? "System"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.orgName ?? "Instance"}
                    {row.targetLabel || row.targetType ? ` · ${row.targetLabel ?? row.targetType}` : ""}
                  </span>
                </span>
                <ChevronDown
                  className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              </button>
              {expanded && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    <span className="text-muted-foreground">{row.time}</span>
                    {row.targetHref && (
                      <Link href={row.targetHref} className="underline underline-offset-2">
                        Open {row.targetType ?? "target"}
                      </Link>
                    )}
                    {row.orgId && (
                      <Link href={`/admin/workspaces/${row.orgId}`} className="underline underline-offset-2">
                        Open workspace
                      </Link>
                    )}
                  </div>
                  <Details row={row} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
