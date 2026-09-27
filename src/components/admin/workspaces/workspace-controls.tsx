"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, ExternalLink, PauseCircle, PlayCircle, Trash2, UserCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ConfirmButton, CopyField, useAdminAction } from "@/components/admin/client"
import { PLAN_OPTIONS, SUBSCRIPTION_STATUS_OPTIONS, type PlanValue, type SubscriptionStatusValue } from "@/components/admin/workspaces/labels"
import {
  deleteWorkspaceAction,
  extendWorkspaceTrialAction,
  setWorkspacePlanAction,
  setWorkspaceStatusAction,
  suspendWorkspaceAction,
  transferWorkspaceOwnershipAction,
  unsuspendWorkspaceAction,
} from "@/app/admin/workspaces/actions"

function Row({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SubscriptionControls({
  id,
  plan,
  status,
  trialEndsLabel,
  trialExpired,
  stripeCustomerId,
  stripeCustomerUrl,
  stripeSubscriptionId,
  currentPeriodLabel,
}: {
  id: string
  plan: PlanValue
  status: SubscriptionStatusValue
  trialEndsLabel: string | null
  trialExpired: boolean
  stripeCustomerId: string | null
  stripeCustomerUrl: string | null
  stripeSubscriptionId: string | null
  currentPeriodLabel: string | null
}) {
  const [nextPlan, setNextPlan] = useState<PlanValue>(plan)
  const [nextStatus, setNextStatus] = useState<SubscriptionStatusValue>(status)
  const [days, setDays] = useState("14")
  const planAction = useAdminAction()
  const statusAction = useAdminAction()
  const trialAction = useAdminAction()

  return (
    <div className="grid gap-5">
      <Row label="Plan" htmlFor="ws-plan" hint="Cloud workspaces are billed through Stripe when billing is enabled.">
        <div className="flex gap-2">
          <Select value={nextPlan} onValueChange={(v) => setNextPlan(v as PlanValue)}>
            <SelectTrigger id="ws-plan" className="w-full min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={nextPlan === plan || planAction.pending}
            onClick={() => planAction.run(() => setWorkspacePlanAction({ id, plan: nextPlan }), { success: "Plan updated" })}
          >
            {planAction.pending && <Spinner />} Save
          </Button>
        </div>
      </Row>

      <Row label="Subscription status" htmlFor="ws-status" hint="Normally kept in sync by the Stripe webhook — override only to fix mistakes.">
        <div className="flex gap-2">
          <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as SubscriptionStatusValue)}>
            <SelectTrigger id="ws-status" className="w-full min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={nextStatus === status || statusAction.pending}
            onClick={() =>
              statusAction.run(() => setWorkspaceStatusAction({ id, status: nextStatus }), { success: "Subscription status updated" })
            }
          >
            {statusAction.pending && <Spinner />} Save
          </Button>
        </div>
      </Row>

      <Row
        label="Trial"
        htmlFor="ws-trial-days"
        hint={
          trialEndsLabel ? (
            <>
              {trialExpired ? "Ended" : "Ends"} {trialEndsLabel}. Extending starts from {trialExpired ? "today" : "the current end date"}.
            </>
          ) : (
            "No trial. Extending starts a trial from today."
          )
        }
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="ws-trial-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="pr-12"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">days</span>
          </div>
          <Button
            variant="outline"
            disabled={!Number(days) || trialAction.pending}
            onClick={() =>
              trialAction.run(() => extendWorkspaceTrialAction({ id, days: Number(days) }), {
                success: (d) => `Trial extended to ${new Date(d.trialEndsAt).toLocaleDateString()}`,
              })
            }
          >
            {trialAction.pending ? <Spinner /> : <CalendarPlus />} Extend
          </Button>
        </div>
      </Row>

      <div className="grid gap-2 border-t border-border pt-4">
        <div className="text-[13px] font-medium">Stripe</div>
        {stripeCustomerId ? (
          <>
            <CopyField value={stripeCustomerId} />
            {stripeSubscriptionId && <CopyField value={stripeSubscriptionId} />}
            {currentPeriodLabel && <p className="text-xs text-muted-foreground">Current period ends {currentPeriodLabel}.</p>}
            {stripeCustomerUrl && (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a href={stripeCustomerUrl} target="_blank" rel="noopener noreferrer">
                  Open customer in Stripe <ExternalLink />
                </a>
              </Button>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">No Stripe customer linked to this workspace.</p>
        )}
      </div>
    </div>
  )
}

export function SuspendControl({ id, name, suspended }: { id: string; name: string; suspended: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, run } = useAdminAction()

  if (suspended) {
    return (
      <ConfirmButton
        title={`Unsuspend ${name}?`}
        description="Members regain full access immediately."
        confirmLabel="Unsuspend"
        action={() => unsuspendWorkspaceAction({ id })}
        success="Workspace unsuspended"
        className="w-full sm:w-auto"
      >
        <PlayCircle /> Unsuspend workspace
      </ConfirmButton>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setReason("")
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PauseCircle /> Suspend workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {name}?</DialogTitle>
          <DialogDescription>
            The workspace becomes read-only for all members and shows your reason in a banner. Mail sync continues. You can unsuspend at any time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="suspend-reason" className="text-[13px]">
            Reason shown to members
          </Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Suspended for violating the acceptable use policy. Contact support@example.com."
            rows={3}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">{reason.length}/500</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => suspendWorkspaceAction({ id, reason }), { success: "Workspace suspended" })
              if (res.ok) setOpen(false)
            }}
          >
            {pending && <Spinner />} Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TransferOwnershipControl({
  id,
  candidates,
}: {
  id: string
  candidates: { userId: string; label: string; role: string }[]
}) {
  const [userId, setUserId] = useState("")
  const chosen = candidates.find((c) => c.userId === userId)
  if (!candidates.length) {
    return <p className="text-[13px] text-muted-foreground">Invite another active member to be able to transfer ownership.</p>
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="w-full min-w-0 flex-1" aria-label="New owner">
          <SelectValue placeholder="Choose the new owner…" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.userId} value={c.userId}>
              {c.label} <span className="text-xs text-muted-foreground">· {c.role}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ConfirmButton
        disabled={!chosen}
        title="Transfer ownership?"
        description={
          chosen ? (
            <>
              <strong className="text-foreground">{chosen.label}</strong> becomes the owner (billing, deletion, all permissions). Current owners
              become admins.
            </>
          ) : null
        }
        confirmLabel="Transfer ownership"
        action={() => transferWorkspaceOwnershipAction({ id, userId })}
        success="Ownership transferred"
        onSuccess={() => setUserId("")}
      >
        <UserCog /> Transfer
      </ConfirmButton>
    </div>
  )
}

export function DeleteWorkspaceControl({ id, name, slug }: { id: string; name: string; slug: string }) {
  const router = useRouter()
  return (
    <ConfirmButton
      destructive
      title={`Delete ${name}?`}
      description={
        <>
          This permanently deletes the workspace with all conversations, messages, comments, contacts, inboxes and settings. Members keep their
          accounts. This cannot be undone.
        </>
      }
      confirmText={slug}
      confirmLabel="Delete workspace"
      action={() => deleteWorkspaceAction({ id, confirm: slug })}
      success={`${name} was deleted`}
      onSuccess={() => router.push("/admin/workspaces")}
      className="w-full sm:w-auto"
    >
      <Trash2 /> Delete workspace
    </ConfirmButton>
  )
}
