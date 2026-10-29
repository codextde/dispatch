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
import { LocalTime, formatLocalTime } from "@/components/app/local-time"
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
import { useI18n } from "@/lib/i18n"

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
  trialEndsAt,
  trialExpired,
  stripeCustomerId,
  stripeCustomerUrl,
  stripeSubscriptionId,
  currentPeriodEndsAt,
}: {
  id: string
  plan: PlanValue
  status: SubscriptionStatusValue
  trialEndsAt: string | null
  trialExpired: boolean
  stripeCustomerId: string | null
  stripeCustomerUrl: string | null
  stripeSubscriptionId: string | null
  currentPeriodEndsAt: string | null
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const [nextPlan, setNextPlan] = useState<PlanValue>(plan)
  const [nextStatus, setNextStatus] = useState<SubscriptionStatusValue>(status)
  const [days, setDays] = useState("14")
  const planAction = useAdminAction()
  const statusAction = useAdminAction()
  const trialAction = useAdminAction()

  return (
    <div className="grid gap-5">
      <Row label={it ? "Piano" : "Plan"} htmlFor="ws-plan" hint={it ? "I workspace cloud vengono fatturati tramite Stripe quando la fatturazione è attiva." : "Cloud workspaces are billed through Stripe when billing is enabled."}>
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
            onClick={() => planAction.run(() => setWorkspacePlanAction({ id, plan: nextPlan }), { success: it ? "Piano aggiornato" : "Plan updated" })}
          >
            {planAction.pending && <Spinner />} {it ? "Salva" : "Save"}
          </Button>
        </div>
      </Row>

      <Row label={it ? "Stato abbonamento" : "Subscription status"} htmlFor="ws-status" hint={it ? "Di norma viene sincronizzato dal webhook Stripe: modifica solo per correggere errori." : "Normally kept in sync by the Stripe webhook — override only to fix mistakes."}>
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
              statusAction.run(() => setWorkspaceStatusAction({ id, status: nextStatus }), { success: it ? "Stato abbonamento aggiornato" : "Subscription status updated" })
            }
          >
            {statusAction.pending && <Spinner />} {it ? "Salva" : "Save"}
          </Button>
        </div>
      </Row>

      <Row
        label={it ? "Periodo di prova" : "Trial"}
        htmlFor="ws-trial-days"
        hint={
          trialEndsAt ? (
            <>
              {trialExpired ? (it ? "Terminato" : "Ended") : (it ? "Termina" : "Ends")} <LocalTime date={trialEndsAt} format="date" />. {it ? "Estendendo, il periodo partirà da" : "Extending starts from"} {trialExpired ? (it ? "oggi" : "today") : (it ? "dalla data di fine attuale" : "the current end date")}.
            </>
          ) : (
            (it ? "Nessun periodo di prova. L’estensione ne avvierà uno da oggi." : "No trial. Extending starts a trial from today.")
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
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{it ? "giorni" : "days"}</span>
          </div>
          <Button
            variant="outline"
            disabled={!Number(days) || trialAction.pending}
            onClick={() =>
              trialAction.run(() => extendWorkspaceTrialAction({ id, days: Number(days) }), {
                success: (d) => it ? `Periodo di prova esteso fino al ${formatLocalTime(d.trialEndsAt, "date")}` : `Trial extended to ${formatLocalTime(d.trialEndsAt, "date")}`,
              })
            }
          >
            {trialAction.pending ? <Spinner /> : <CalendarPlus />} {it ? "Estendi" : "Extend"}
          </Button>
        </div>
      </Row>

      <div className="grid gap-2 border-t border-border pt-4">
        <div className="text-[13px] font-medium">Stripe</div>
        {stripeCustomerId ? (
          <>
            <CopyField value={stripeCustomerId} />
            {stripeSubscriptionId && <CopyField value={stripeSubscriptionId} />}
            {currentPeriodEndsAt && (
              <p className="text-xs text-muted-foreground">
                {it ? "Il periodo attuale termina il" : "Current period ends"} <LocalTime date={currentPeriodEndsAt} format="date" />.
              </p>
            )}
            {stripeCustomerUrl && (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a href={stripeCustomerUrl} target="_blank" rel="noopener noreferrer">
                  {it ? "Apri cliente in Stripe" : "Open customer in Stripe"} <ExternalLink />
                </a>
              </Button>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">{it ? "Nessun cliente Stripe collegato a questo workspace." : "No Stripe customer linked to this workspace."}</p>
        )}
      </div>
    </div>
  )
}

export function SuspendControl({ id, name, suspended }: { id: string; name: string; suspended: boolean }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, run } = useAdminAction()

  if (suspended) {
    return (
      <ConfirmButton
        title={it ? `Riattivare ${name}?` : `Unsuspend ${name}?`}
        description={it ? "I membri riacquisteranno subito l’accesso completo." : "Members regain full access immediately."}
        confirmLabel={it ? "Riattiva" : "Unsuspend"}
        action={() => unsuspendWorkspaceAction({ id })}
        success={it ? "Workspace riattivato" : "Workspace unsuspended"}
        className="w-full sm:w-auto"
      >
        <PlayCircle /> {it ? "Riattiva workspace" : "Unsuspend workspace"}
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
          <PauseCircle /> {it ? "Sospendi workspace" : "Suspend workspace"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{it ? `Sospendere ${name}?` : `Suspend ${name}?`}</DialogTitle>
          <DialogDescription>
            {it ? "Il workspace diventa di sola lettura per tutti i membri e mostra il motivo in un avviso. La sincronizzazione della posta continua. Puoi riattivarlo in qualsiasi momento." : "The workspace becomes read-only for all members and shows your reason in a banner. Mail sync continues. You can unsuspend at any time."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="suspend-reason" className="text-[13px]">
            {it ? "Motivo mostrato ai membri" : "Reason shown to members"}
          </Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={it ? "es. Sospeso per violazione delle condizioni d’uso. Contatta supporto@example.com." : "e.g. Suspended for violating the acceptable use policy. Contact support@example.com."}
            rows={3}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">{reason.length}/500</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              {it ? "Annulla" : "Cancel"}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => suspendWorkspaceAction({ id, reason }), { success: it ? "Workspace sospeso" : "Workspace suspended" })
              if (res.ok) setOpen(false)
            }}
          >
            {pending && <Spinner />} {it ? "Sospendi" : "Suspend"}
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
  const { locale } = useI18n()
  const it = locale === "it"
  const [userId, setUserId] = useState("")
  const chosen = candidates.find((c) => c.userId === userId)
  if (!candidates.length) {
    return <p className="text-[13px] text-muted-foreground">{it ? "Invita un altro membro attivo per poter trasferire la proprietà." : "Invite another active member to be able to transfer ownership."}</p>
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="w-full min-w-0 flex-1" aria-label={it ? "Nuovo proprietario" : "New owner"}>
          <SelectValue placeholder={it ? "Scegli il nuovo proprietario…" : "Choose the new owner…"} />
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
        title={it ? "Trasferire la proprietà?" : "Transfer ownership?"}
        description={
          chosen ? (
            <>
              <strong className="text-foreground">{chosen.label}</strong> {it ? "diventerà proprietario (fatturazione, eliminazione e tutti i permessi). Gli attuali proprietari diventeranno amministratori." : "becomes the owner (billing, deletion, all permissions). Current owners become admins."}
            </>
          ) : null
        }
        confirmLabel={it ? "Trasferisci proprietà" : "Transfer ownership"}
        action={() => transferWorkspaceOwnershipAction({ id, userId })}
        success={it ? "Proprietà trasferita" : "Ownership transferred"}
        onSuccess={() => setUserId("")}
      >
        <UserCog /> {it ? "Trasferisci" : "Transfer"}
      </ConfirmButton>
    </div>
  )
}

export function DeleteWorkspaceControl({ id, name, slug }: { id: string; name: string; slug: string }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const router = useRouter()
  return (
    <ConfirmButton
      destructive
      title={it ? `Eliminare ${name}?` : `Delete ${name}?`}
      description={
        <>
          {it ? "Il workspace verrà eliminato definitivamente con tutte le conversazioni, i messaggi, i commenti, i contatti, le caselle e le impostazioni. I membri manterranno i propri account. L’operazione non si può annullare." : "This permanently deletes the workspace with all conversations, messages, comments, contacts, inboxes and settings. Members keep their accounts. This cannot be undone."}
        </>
      }
      confirmText={slug}
      confirmLabel={it ? "Elimina workspace" : "Delete workspace"}
      action={() => deleteWorkspaceAction({ id, confirm: slug })}
      success={it ? `${name} è stato eliminato` : `${name} was deleted`}
      onSuccess={() => router.push("/admin/workspaces")}
      className="w-full sm:w-auto"
    >
      <Trash2 /> {it ? "Elimina workspace" : "Delete workspace"}
    </ConfirmButton>
  )
}
