"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { api } from "@/lib/api-client"
import { useI18n } from "@/lib/i18n"

type Batch = { next: string | null; verified: number; skipped: number }

export function CompactMailbox({ slug, account }: { slug: string; account: string }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const queryClient = useQueryClient()
  const stop = useRef(false)
  const cursor = useRef<string | null>(null)
  const [progress, setProgress] = useState({ verified: 0, skipped: 0 })
  const [done, setDone] = useState(false)

  useEffect(() => () => { stop.current = true }, [])

  const compact = useMutation({
    mutationFn: async () => {
      stop.current = false
      if (done) {
        cursor.current = null
        setDone(false)
        setProgress({ verified: 0, skipped: 0 })
      }
      while (!stop.current) {
        const batch = await api.put<Batch>(`/api/w/${slug}/mail-archive`, { account, after: cursor.current })
        cursor.current = batch.next
        setProgress((current) => ({ verified: current.verified + batch.verified, skipped: current.skipped + batch.skipped }))
        if (!batch.next) {
          setDone(true)
          return
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbox", slug] })
    },
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {compact.isPending ? (
        <Button size="sm" variant="outline" onClick={() => { stop.current = true }}>
          {it ? "Ferma dopo il messaggio corrente" : "Stop after the current message"}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              {!done && progress.verified + progress.skipped > 0 ? (it ? "Riprendi pulizia" : "Resume cleanup") : (it ? "Libera copie locali" : "Release local copies")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{it ? "Liberare le copie locali di questa casella?" : "Release local copies for this mailbox?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {it
                  ? "Dispatch confronta le copie locali con il server di posta. Dopo la verifica conserva il testo e legge la formattazione e gli allegati dal server. Puoi fermare la pulizia dopo il messaggio corrente."
                  : "Dispatch compares local copies with the mail server. After verification it keeps the plain text and reads formatting and attachments from the server. You can stop the cleanup after the current message."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{it ? "Annulla" : "Cancel"}</AlertDialogCancel>
              <AlertDialogAction onClick={() => compact.mutate()}>{it ? "Avvia pulizia" : "Start cleanup"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {(compact.isPending || done || progress.verified > 0 || progress.skipped > 0) && (
        <span role="status" className="text-xs text-muted-foreground">
          {it
            ? `${done ? "Pulizia terminata. " : ""}${progress.verified} copie verificate, ${progress.skipped} saltate.`
            : `${done ? "Cleanup finished. " : ""}${progress.verified} copies verified, ${progress.skipped} skipped.`}
        </span>
      )}
      {compact.error && <span role="alert" className="text-xs text-destructive">{compact.error.message}</span>}
    </div>
  )
}
