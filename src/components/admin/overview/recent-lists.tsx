"use client"

import Link from "next/link"
import { Building2, ScrollText } from "lucide-react"
import type { RecentWorkspace } from "@/server/admin/overview"
import type { AuditEvent } from "@/server/admin/audit"
import { UserAvatar } from "@/components/app/user-avatar"
import { EmptyState, StatusBadge, type Tone } from "@/components/admin/ui"
import { LocalTime } from "@/components/app/local-time"
import { ActionBadge } from "@/components/admin/audit/action-badge"
import { useI18n } from "@/lib/i18n"

const PLAN_LABEL: Record<string, string> = {
  self_hosted: "Self-hosted",
  free: "Free",
  cloud: "Cloud",
  comped: "Comped",
}

export function workspaceStatus(w: { plan: string; subscriptionStatus: string; suspendedAt: Date | null }, locale: "en" | "it" = "en"): {
  tone: Tone
  label: string
} {
  if (w.suspendedAt) return { tone: "error", label: locale === "it" ? "Sospeso" : "Suspended" }
  if (w.plan !== "cloud") return { tone: "neutral", label: locale === "it" ? ({ self_hosted: "Installato in autonomia", free: "Gratuito", cloud: "Cloud", comped: "Gratuito" }[w.plan] ?? w.plan) : (PLAN_LABEL[w.plan] ?? w.plan) }
  switch (w.subscriptionStatus) {
    case "active":
      return { tone: "ok", label: locale === "it" ? "Attivo" : "Active" }
    case "trialing":
      return { tone: "info", label: locale === "it" ? "Prova" : "Trial" }
    case "past_due":
      return { tone: "warn", label: locale === "it" ? "Pagamento in ritardo" : "Past due" }
    case "canceled":
    case "unpaid":
    case "incomplete":
      return { tone: "error", label: locale === "it" ? ({ canceled: "Annullato", unpaid: "Non pagato", incomplete: "Incompleto" }[w.subscriptionStatus] ?? w.subscriptionStatus) : w.subscriptionStatus.replace("_", " ") }
    default:
      return { tone: "neutral", label: locale === "it" ? "Nessun abbonamento" : "No subscription" }
  }
}

export function RecentWorkspacesList({ workspaces }: { workspaces: RecentWorkspace[] }) {
  const { locale } = useI18n()
  const it = locale === "it"
  if (!workspaces.length) {
    return (
      <EmptyState
        icon={Building2}
        title={it ? "Nessun workspace" : "No workspaces yet"}
        description={it ? "I workspace compariranno qui appena ne verrà creato uno." : "Workspaces appear here as soon as someone creates one."}
      />
    )
  }
  return (
    <ul className="-my-1 divide-y divide-border">
      {workspaces.map((w) => {
        const status = workspaceStatus(w, locale)
        return (
          <li key={w.id}>
            <Link
              href={`/admin/workspaces/${w.id}`}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-xs font-semibold text-background"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided logo URLs */}
                {w.logoUrl ? <img src={w.logoUrl} alt="" className="size-8 object-cover" /> : w.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {w.ownerEmail ?? (it ? "Nessun proprietario" : "No owner")} · {w.members} {it ? (w.members === 1 ? "membro" : "membri") : (w.members === 1 ? "member" : "members")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <LocalTime date={w.createdAt} format="relative" titleFormat="datetime" className="text-[11px] text-muted-foreground" />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function RecentAuditList({ events }: { events: AuditEvent[] }) {
  const { locale } = useI18n()
  const it = locale === "it"
  if (!events.length) {
    return (
      <EmptyState
        icon={ScrollText}
        title={it ? "Nessuna attività" : "No activity yet"}
        description={it ? "Qui vengono registrati gli accessi, le modifiche alle impostazioni e le azioni amministrative." : "Sign-ins, settings changes and admin actions are recorded here."}
      />
    )
  }
  return (
    <ul className="-my-1 divide-y divide-border">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2.5">
          {e.actorEmail ? (
            <UserAvatar name={e.actorName} email={e.actorEmail} src={e.actorAvatarUrl} size="sm" className="mt-0.5" />
          ) : (
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] text-muted-foreground">
              SYS
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <ActionBadge action={e.action} />
              {e.orgName && <span className="truncate text-xs text-muted-foreground">{it ? "nel workspace" : "in"} {e.orgName}</span>}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {e.actorEmail ?? (it ? "Sistema" : "System")}
              {e.targetLabel && e.targetLabel !== e.actorEmail ? ` → ${e.targetLabel}` : ""}
            </div>
          </div>
          <LocalTime
            date={e.createdAt}
            format="relative"
            titleFormat="datetime"
            className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground"
          />
        </li>
      ))}
    </ul>
  )
}
