"use client"

import { StatusBadge } from "@/components/settings/settings-ui"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { InboxStatus } from "@/components/settings/inboxes/types"

const STATUS: Record<InboxStatus, { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string; pulse?: boolean }> = {
  pending: { tone: "info", label: "Pending", pulse: true },
  syncing: { tone: "info", label: "Syncing", pulse: true },
  active: { tone: "success", label: "Active" },
  error: { tone: "danger", label: "Error" },
  paused: { tone: "neutral", label: "Paused" },
}

export function InboxStatusBadge({ status, lastError }: { status: InboxStatus; lastError?: string | null }) {
  const s = STATUS[status] ?? STATUS.pending
  const badge = (
    <StatusBadge tone={s.tone} pulse={s.pulse}>
      {s.label}
    </StatusBadge>
  )
  if (status !== "error" || !lastError) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Error: ${lastError}`}>
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty break-words">{lastError}</TooltipContent>
    </Tooltip>
  )
}
