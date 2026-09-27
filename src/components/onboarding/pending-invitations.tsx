"use client"

/* eslint-disable @next/next/no-img-element -- workspace logos are user-provided URLs/uploads, not optimizable assets */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { acceptPendingInvitationAction } from "@/app/onboarding/actions"

export type PendingInvitation = {
  id: string
  orgName: string
  orgLogoUrl: string | null
  roleName: string
  inviterName: string | null
  expiresAt: string
}

/** Invitations waiting for the signed-in user (by email), each with a "Join" button. */
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const [joining, setJoining] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {invitations.map((inv) => (
        <li key={inv.id} className="flex items-center gap-3 p-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground text-sm font-semibold text-background">
            {inv.orgLogoUrl ? <img src={inv.orgLogoUrl} alt="" className="size-9 object-cover" /> : inv.orgName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{inv.orgName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {inv.inviterName ? `Invited by ${inv.inviterName}` : "Invitation"} · {inv.roleName}
            </span>
          </span>
          <Button
            size="sm"
            className="rounded-md"
            disabled={pending}
            onClick={() => {
              setJoining(inv.id)
              startTransition(async () => {
                const res = await acceptPendingInvitationAction({ invitationId: inv.id })
                if (!res.ok) {
                  toast.error(res.error)
                  setJoining(null)
                  return
                }
                window.location.assign(res.data.path)
              })
            }}
          >
            {joining === inv.id ? <Spinner /> : null} Join <ArrowRight />
          </Button>
        </li>
      ))}
    </ul>
  )
}
