"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useOrg } from "@/components/app/org-provider"
import { api } from "@/lib/api-client"
import { useI18n } from "@/lib/i18n"

export function InvitationCard({ attachmentId }: { attachmentId: string }) {
  const { org, locked } = useOrg()
  const { locale } = useI18n()
  const it = locale === "it"
  const path = `/api/w/${org.slug}/calendar/invitations/${attachmentId}`
  const query = useQuery({
    queryKey: ["calendar-invitation", org.slug, attachmentId],
    queryFn: () => api.get<{ title: string; replyable: boolean; cancelled: boolean }>(path),
    retry: false,
  })
  const reply = useMutation({ mutationFn: (response: string) => api.post(path, { response }) })
  if (!query.data) return null
  const actions = [
    { id: "IMPORT", label: it ? "Aggiungi al calendario" : "Add to calendar" },
    ...(query.data.replyable ? [
      { id: "ACCEPTED", label: it ? "Accetta" : "Accept" },
      { id: "TENTATIVE", label: it ? "Forse" : "Maybe" },
      { id: "DECLINED", label: it ? "Rifiuta" : "Decline" },
    ] : []),
  ]
  return <section className="mt-3 space-y-2 rounded-lg border bg-card p-3 text-sm">
    <h3 className="flex items-center gap-2 font-medium"><CalendarDays className="size-4 text-brand" />
      {query.data.title || (it ? "Invito al calendario" : "Calendar invitation")}
    </h3>
    {query.data.cancelled ? <p className="text-muted-foreground">{it ? "Evento annullato" : "Event cancelled"}</p>
      : !locked && <div className="flex flex-wrap gap-1.5">{actions.map(({ id, label }) =>
        <Button key={id} size="sm" variant="outline" disabled={reply.isPending} onClick={() => reply.mutate(id)}>{label}</Button>
      )}</div>}
    {reply.isSuccess && <p role="status" className="text-muted-foreground">{reply.variables === "IMPORT"
      ? (it ? "Evento aggiunto" : "Event added")
      : (it ? "Risposta in coda per l’invio" : "Reply queued for sending")}</p>}
    {reply.error && <p role="alert" className="text-destructive">{reply.error.message}</p>}
  </section>
}
