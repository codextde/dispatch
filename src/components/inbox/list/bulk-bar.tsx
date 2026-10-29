"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CircleCheck,
  Clock,
  Ellipsis,
  MailOpen,
  Mail,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
  ArchiveRestore,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useOrg } from "@/components/app/org-provider"
import { api } from "@/lib/api-client"
import { pluralize } from "@/lib/inbox/format"
import type { ConversationListItem } from "@/lib/inbox/types"
import { inboxKeys } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { useConversationActions } from "@/hooks/inbox/use-conversation-actions"
import { useInbox } from "../inbox-provider"
import { AssigneePicker, LabelPicker, SnoozePicker, TeamPicker } from "../pickers"
import { useI18n } from "@/lib/i18n"

function IconAction({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Bulk actions for the selected conversations (replaces the list header). */
export function BulkBar({ box, items, allSelected, onSelectAll }: { box: string; items: ConversationListItem[]; allSelected: boolean; onSelectAll: () => void }) {
  const { slug, bootstrap } = useInbox()
  const { t, locale } = useI18n()
  const { can } = useOrg()
  const qc = useQueryClient()
  const { run } = useConversationActions()
  const [picker, setPicker] = useState<"assign" | "label" | "snooze" | "team" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ids = items.map((i) => i.id)
  const n = ids.length
  const done = () => inboxUI.clearSelection()

  const allClosed = items.every((i) => i.status === "closed")
  const allRead = items.every((i) => !i.unread)
  const allStarred = items.every((i) => i.starred)
  const inTrash = box === "trash"
  const inSpam = box === "spam"

  const assignedAll = items.length ? items[0]!.assigneeIds.filter((u) => items.every((i) => i.assigneeIds.includes(u))) : []
  const assignedSome = [...new Set(items.flatMap((i) => i.assigneeIds))].filter((u) => !assignedAll.includes(u))
  const labelsAll = items.length ? items[0]!.labelIds.filter((l) => items.every((i) => i.labelIds.includes(l))) : []
  const labelsSome = [...new Set(items.flatMap((i) => i.labelIds))].filter((l) => !labelsAll.includes(l))

  const del = useMutation({
    mutationFn: () => api.post<{ deleted: string[] }>(`/api/w/${slug}/conversations/bulk`, { ids, action: "delete" }),
    onSuccess: (r) => {
      toast.success(locale === "it" ? `${r.deleted.length === 1 ? "Conversazione eliminata" : "Conversazioni eliminate"} definitivamente` : `${pluralize(r.deleted.length, "conversation")} deleted permanently`)
      done()
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      <Checkbox
        aria-label={allSelected ? t("deselectAll") : t("selectAll")}
        checked={allSelected ? true : "indeterminate"}
        onCheckedChange={() => (allSelected ? done() : onSelectAll())}
        className="mr-2 ml-1"
      />
      <span className="mr-auto truncate text-[13px] font-medium tabular-nums">{n} {locale === "it" ? (n === 1 ? "selezionata" : "selezionate") : "selected"}</span>

      {!inTrash && (
        <IconAction
          label={allClosed ? t("reopen") : t("close")}
          onClick={() => {
            run(ids, { status: allClosed ? "open" : "closed" }, { undo: locale === "it" ? `${n === 1 ? "Conversazione" : "Conversazioni"} ${allClosed ? "riaperta" : "chiusa"}` : `${pluralize(n, "conversation")} ${allClosed ? "reopened" : "closed"}` })
            done()
          }}
        >
          {allClosed ? <RotateCcw /> : <CircleCheck />}
        </IconAction>
      )}
      {!inTrash && (
        <AssigneePicker
          open={picker === "assign"}
          onOpenChange={(o) => setPicker(o ? "assign" : null)}
          value={assignedAll}
          partial={assignedSome}
          onToggle={(userId, assign) => run(ids, assign ? { addAssigneeIds: [userId] } : { removeAssigneeIds: [userId] })}
        >
          <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t("inboxUiAssign")}>
            <UserPlus />
          </Button>
        </AssigneePicker>
      )}
      {!inTrash && (
        <LabelPicker
          open={picker === "label"}
          onOpenChange={(o) => setPicker(o ? "label" : null)}
          value={labelsAll}
          partial={labelsSome}
          onToggle={(labelId, add) => run(ids, add ? { addLabelIds: [labelId] } : { removeLabelIds: [labelId] })}
        >
          <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t("inboxUiLabels")}>
            <Tag />
          </Button>
        </LabelPicker>
      )}
      {!inTrash && (
        <SnoozePicker
          open={picker === "snooze"}
          onOpenChange={(o) => setPicker(o ? "snooze" : null)}
          snoozedUntil={items.find((i) => i.snoozedUntil)?.snoozedUntil}
          onSnooze={(until) => {
            run(ids, { snoozedUntil: until ? until.toISOString() : null }, { undo: until ? (locale === "it" ? `${n === 1 ? "Conversazione posticipata" : "Conversazioni posticipate"}` : `${pluralize(n, "conversation")} snoozed`) : t("inboxUiUnsnooze") })
            done()
          }}
        >
          <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t("inboxUiSnooze")}>
            <Clock />
          </Button>
        </SnoozePicker>
      )}
      {inTrash && (
        <IconAction
          label={t("restore")}
          onClick={() => {
            run(ids, { trash: false }, { undo: locale === "it" ? `${n === 1 ? "Conversazione ripristinata" : "Conversazioni ripristinate"}` : `${pluralize(n, "conversation")} restored` })
            done()
          }}
        >
          <ArchiveRestore />
        </IconAction>
      )}

      {!inTrash && bootstrap.teams.length > 0 && (
        <TeamPicker
          open={picker === "team"}
          onOpenChange={(o) => setPicker(o ? "team" : null)}
          value={items.every((i) => i.teamId === items[0]?.teamId) ? (items[0]?.teamId ?? null) : null}
          onSelect={(teamId) => {
            run(ids, { teamId }, { undo: locale === "it" ? `${n === 1 ? "Conversazione spostata" : "Conversazioni spostate"}` : `${pluralize(n, "conversation")} moved` })
            setPicker(null)
            done()
          }}
        >
          <Button variant="ghost" size="icon-sm" className="max-md:hidden" aria-label={t("moveToTeam")}>
            <Users />
          </Button>
        </TeamPicker>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label={t("inboxUiMoreActions")}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => (run(ids, { read: !allRead }), done())}>
            {allRead ? <Mail /> : <MailOpen />} {allRead ? t("markUnread") : t("markRead")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => (run(ids, { starred: !allStarred }), done())}>
            <Star /> {allStarred ? t("unstar") : t("star")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!inTrash && (
            <DropdownMenuItem onSelect={() => (run(ids, { spam: !inSpam }, { undo: locale === "it" ? (inSpam ? "Contrassegnate come non spam" : "Contrassegnate come spam") : (inSpam ? "Marked as not spam" : "Marked as spam") }), done())}>
              {inSpam ? <ShieldCheck /> : <ShieldAlert />} {inSpam ? t("inboxUiNotSpam") : t("inboxUiMarkSpam")}
            </DropdownMenuItem>
          )}
          {can("conversations.delete") && !inTrash && (
            <DropdownMenuItem variant="destructive" onSelect={() => (run(ids, { trash: true }, { undo: locale === "it" ? `${n === 1 ? "Conversazione spostata" : "Conversazioni spostate"} nel cestino` : `${pluralize(n, "conversation")} moved to trash` }), done())}>
              <Trash2 /> {t("moveToTrash")}
            </DropdownMenuItem>
          )}
          {can("conversations.delete") && inTrash && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> {t("deletePermanently")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={done}>
            <X /> {t("clearSelection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{locale === "it" ? `Eliminare definitivamente ${n === 1 ? "questa conversazione" : "queste conversazioni"}?` : `Delete ${pluralize(n, "conversation")} permanently?`}</AlertDialogTitle>
            <AlertDialogDescription>{locale === "it" ? "Messaggi, commenti e allegati verranno rimossi per tutti. L’operazione non si può annullare." : "Messages, comments and attachments will be removed for everyone. This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("inboxUiCancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => del.mutate()}>
              {t("deleteForever")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
