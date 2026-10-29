"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { GitMerge } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/api-client"
import { listTime, participantName } from "@/lib/inbox/format"
import type { ConversationDetail, ConversationListItem } from "@/lib/inbox/types"
import { inboxKeys, useSearch } from "@/hooks/inbox/queries"
import { useInbox } from "../inbox-provider"
import { useI18n } from "@/lib/i18n"

/** Merge the open conversation into another one (search by subject, sender or #number). */
export function MergeDialog({ conv, open, onOpenChange }: { conv: ConversationDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, locale } = useI18n()
  const { slug } = useInbox()
  const router = useRouter()
  const params = useParams<{ box?: string }>()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [target, setTarget] = useState<ConversationListItem | null>(null)
  const { data = [], isFetching } = useSearch(slug, q)
  const results = data.filter((c) => c.id !== conv.id && c.kind === "email")

  const merge = useMutation({
    mutationFn: (targetId: string) => api.post(`/api/w/${slug}/conversations/${conv.id}/merge`, { targetId }),
    onSuccess: (_d, targetId) => {
      toast.success(t("convMergedInto").replace("#{number}", `#${target?.number}`))
      onOpenChange(false)
      void qc.invalidateQueries({ queryKey: inboxKeys.all(slug) })
      router.replace(`/w/${slug}/${params.box ?? "all"}/${targetId}`)
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setTarget(null)
          setQ("")
        }
      }}
    >
      <DialogContent className="gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("convMergeTitle")}</DialogTitle>
          <DialogDescription>
            {t("convMergeDescription").split("#{number}")[0]}<span className="font-medium text-foreground">#{conv.number}</span>{t("convMergeDescription").split("#{number}")[1]}
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-lg border">
          <CommandInput placeholder={t("convSearchMerge")} value={q} onValueChange={setQ} autoFocus />
          <CommandList className="max-h-72">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("convTypeTwoChars")}</p>
            ) : isFetching && !results.length ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>{t("convNoFound")}</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((c) => (
                  <CommandItem key={c.id} value={c.id} data-checked={target?.id === c.id} onSelect={() => setTarget(c)}>
                    <span className="font-mono text-[11px] text-muted-foreground">#{c.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.subject || t("convNoSubject")}</span>
                      <span className="block truncate text-xs text-muted-foreground">{participantName(c.participants[0] ?? c.lastFrom)}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{listTime(c.lastActivityAt, locale)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={!target || merge.isPending} onClick={() => target && merge.mutate(target.id)}>
            {merge.isPending ? <Spinner /> : <GitMerge />}
            {target ? t("convMergeInto").replace("#{number}", `#${target.number}`) : t("convMerge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
