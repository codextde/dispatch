"use client"

import { useState } from "react"
import {
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  CircleCheck,
  Clock,
  Copy,
  Ellipsis,
  Flag,
  GitMerge,
  Mail,
  PanelRight,
  Pin,
  PinOff,
  Plus,
  Printer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
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
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { useOrg } from "@/components/app/org-provider"
import { firstName, memberName, untilLabel } from "@/lib/inbox/format"
import type { ConversationDetail } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxUI, useInboxUI, type PickerKind } from "@/hooks/inbox/store"
import { useNow } from "@/hooks/inbox/use-now"
import { useViewers } from "@/hooks/inbox/use-realtime"
import { useInbox } from "../inbox-provider"
import { AssigneePicker, LabelPicker, SnoozePicker, TeamPicker } from "../pickers"
import { useShortcutHint } from "../shortcut-hint"
import type { ShortcutAction } from "@/lib/inbox/shortcuts"
import { MergeDialog } from "./merge-dialog"
import type { ConversationCommands } from "./use-conversation-commands"

/** On mobile the picker triggers collapse into an invisible anchor below the header (pickers open from menus/actions). */
const MOBILE_ANCHOR =
  "max-md:pointer-events-none max-md:absolute max-md:top-12 max-md:right-3 max-md:size-px max-md:min-w-0 max-md:overflow-hidden max-md:border-0 max-md:p-0 max-md:opacity-0"

function HeaderButton({ label, shortcut, onClick, active, children, className }: { label: string; shortcut?: string; onClick?: () => void; active?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} onClick={onClick} className={className}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

function EditableSubject({ conv, onRename, readOnly }: { conv: ConversationDetail; onRename: (s: string | null) => void; readOnly: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const subject = conv.subject || "(no subject)"
  if (editing) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault()
          const next = value.trim()
          onRename(next && next !== conv.rawSubject ? next : null)
          setEditing(false)
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              setEditing(false)
            }
          }}
          aria-label="Conversation subject"
          maxLength={300}
          className="w-full rounded-md border bg-card px-2 py-1 text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
    )
  }
  return (
    <h1
      className={cn("min-w-0 truncate text-[15px] font-semibold tracking-tight md:text-base", !readOnly && "cursor-text rounded-md px-1 -mx-1 hover:bg-muted/60")}
      title={readOnly ? subject : `${subject} — click to rename`}
      onClick={() => {
        if (readOnly) return
        setValue(conv.customSubject ?? conv.subject)
        setEditing(true)
      }}
    >
      {subject}
    </h1>
  )
}

function Hint({ action }: { action: ShortcutAction }) {
  const hint = useShortcutHint()(action)
  return hint ? <DropdownMenuShortcut>{hint}</DropdownMenuShortcut> : null
}

export function ConversationHeader({ conv, cmd, detailsOpen, onToggleDetails }: { conv: ConversationDetail; cmd: ConversationCommands; detailsOpen: boolean; onToggleDetails: () => void }) {
  const { account, team, label, member, meId, bootstrap } = useInbox()
  const { can } = useOrg()
  const hint = useShortcutHint()
  const picker = useInboxUI((s) => s.picker)
  const setPicker = (p: PickerKind) => inboxUI.set({ picker: p })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const viewers = useViewers(conv.id).filter((v) => v.userId !== meId)
  const writable = conv.level !== "read"
  const acc = account(conv.accountId)
  const tm = team(conv.teamId)
  const now = useNow()
  const snoozed = conv.snoozedUntil && new Date(conv.snoozedUntil).getTime() > now
  const labels = conv.labelIds.map((id) => label(id)).filter(Boolean)
  const assignees = conv.assigneeIds.map((id) => member(id)).filter(Boolean)
  const canDelete = can("conversations.delete")

  return (
    <header className="relative shrink-0 border-b bg-card/80 backdrop-blur supports-backdrop-filter:bg-card/70 print:border-0">
      <div className="flex h-12 items-center gap-1.5 px-2 pt-[env(safe-area-inset-top)] md:px-4">
        <Button variant="ghost" size="icon" className="-ml-1 size-10 md:hidden" aria-label="Back to list" onClick={cmd.back}>
          <ArrowLeft />
        </Button>
        <EditableSubject conv={conv} onRename={cmd.rename} readOnly={!writable} />
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground max-sm:hidden">#{conv.number}</span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 print:hidden">
          {viewers.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mr-1 flex -space-x-1.5 max-sm:hidden" aria-label="Also viewing">
                  {viewers.slice(0, 4).map((v) => {
                    const m = member(v.userId)
                    return (
                      <span key={v.userId} className="relative">
                        <UserAvatar name={m?.name} email={m?.email} src={m?.avatarUrl} size="sm" className={cn("ring-2 ring-card", v.composing && "ring-amber-400")} />
                        <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-brand ring-2 ring-card" />
                      </span>
                    )
                  })}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {viewers.map((v) => `${firstName(member(v.userId))}${v.composing ? ` (${v.composing === "reply" ? "replying" : "commenting"})` : ""}`).join(", ")} viewing
              </TooltipContent>
            </Tooltip>
          )}

          {writable && (
            <Button
              variant={conv.status === "closed" ? "outline" : "default"}
              size="sm"
              className="mr-1 max-md:hidden"
              onClick={cmd.toggleStatus}
            >
              {conv.status === "closed" ? <RotateCcw /> : <CircleCheck />}
              {conv.status === "closed" ? "Reopen" : "Close"}
              {hint("close") && (
                <Kbd className={cn("ml-0.5 max-lg:hidden", conv.status !== "closed" && "bg-primary-foreground/15 text-primary-foreground/80")}>{hint("close")}</Kbd>
              )}
            </Button>
          )}

          {writable && (
            <AssigneePicker open={picker === "assign"} onOpenChange={(o) => setPicker(o ? "assign" : null)} value={conv.assigneeIds} onToggle={cmd.toggleAssignee}>
              <Button variant="ghost" size="sm" className={cn("h-8 gap-1 px-1.5", MOBILE_ANCHOR)} aria-label="Assign">
                {assignees.length ? (
                  <span className="flex -space-x-1.5">
                    {assignees.slice(0, 3).map((a) => (
                      <UserAvatar key={a!.id} name={a!.name} email={a!.email} src={a!.avatarUrl} size="sm" className="ring-2 ring-card" />
                    ))}
                  </span>
                ) : (
                  <UserPlus />
                )}
              </Button>
            </AssigneePicker>
          )}
          {writable && (
            <LabelPicker open={picker === "label"} onOpenChange={(o) => setPicker(o ? "label" : null)} value={conv.labelIds} onToggle={cmd.toggleLabel}>
              <Button variant="ghost" size="icon-sm" className={MOBILE_ANCHOR} aria-label="Labels">
                <Tag />
              </Button>
            </LabelPicker>
          )}
          {writable && (
            <SnoozePicker open={picker === "snooze"} onOpenChange={(o) => setPicker(o ? "snooze" : null)} snoozedUntil={conv.snoozedUntil} onSnooze={cmd.snooze}>
              <Button variant="ghost" size="icon-sm" className={cn(MOBILE_ANCHOR, snoozed && "text-amber-600")} aria-label="Snooze">
                <Clock />
              </Button>
            </SnoozePicker>
          )}
          <HeaderButton label={conv.starred ? "Unstar" : "Star"} shortcut={hint("star") ?? undefined} onClick={cmd.toggleStar} active={conv.starred} className="max-sm:hidden">
            <Star className={cn(conv.starred && "fill-amber-400 text-amber-400")} />
          </HeaderButton>
          {bootstrap.teams.length > 0 && writable && (
            <TeamPicker open={picker === "team"} onOpenChange={(o) => setPicker(o ? "team" : null)} value={conv.teamId} onSelect={(t) => (cmd.moveToTeam(t), setPicker(null))}>
              <Button variant="ghost" size="icon-sm" className={MOBILE_ANCHOR} aria-label="Move to team">
                <Users />
              </Button>
            </TeamPicker>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label="More actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {writable && (
                <DropdownMenuItem onSelect={cmd.toggleStatus} className="md:hidden">
                  {conv.status === "closed" ? <RotateCcw /> : <CircleCheck />} {conv.status === "closed" ? "Reopen" : "Close"}
                  <Hint action="close" />
                </DropdownMenuItem>
              )}
              {writable && (
                <>
                  <DropdownMenuItem className="md:hidden" onSelect={() => setTimeout(() => setPicker("assign"), 0)}>
                    <UserPlus /> Assign…<Hint action="assign" />
                  </DropdownMenuItem>
                  <DropdownMenuItem className="md:hidden" onSelect={() => setTimeout(() => setPicker("label"), 0)}>
                    <Tag /> Labels…<Hint action="label" />
                  </DropdownMenuItem>
                  <DropdownMenuItem className="md:hidden" onSelect={() => setTimeout(() => setPicker("snooze"), 0)}>
                    <Clock /> Snooze…<Hint action="snooze" />
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onSelect={cmd.toggleStar} className="sm:hidden">
                <Star /> {conv.starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              {writable && (
                <DropdownMenuItem onSelect={cmd.assignToMe}>
                  <UserPlus /> {conv.assigneeIds.includes(meId) ? "Unassign me" : "Assign to me"}
                  <Hint action="assignMe" />
                </DropdownMenuItem>
              )}
              {writable && (
                <DropdownMenuItem onSelect={cmd.togglePriority}>
                  <Flag className={cn(conv.priority && "fill-red-500 text-red-500")} /> {conv.priority ? "Remove priority" : "Mark as priority"}
                </DropdownMenuItem>
              )}
              {bootstrap.teams.length > 0 && writable && (
                <DropdownMenuItem onSelect={() => setTimeout(() => setPicker("team"), 0)}>
                  <Users /> Move to team…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={cmd.markUnread}>
                <Mail /> Mark as unread<Hint action="markUnread" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cmd.togglePin}>
                {conv.pinned ? <PinOff /> : <Pin />} {conv.pinned ? "Unpin" : "Pin to top"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cmd.toggleFollow}>
                {conv.following ? <BellOff /> : <Bell />} {conv.following ? "Unfollow" : "Follow"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cmd.toggleMute}>
                {conv.muted ? <Volume2 /> : <VolumeX />} {conv.muted ? "Unmute" : "Mute notifications"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={cmd.copyLink}>
                <Copy /> Copy link
              </DropdownMenuItem>
              {writable && conv.kind === "email" && (
                <DropdownMenuItem onSelect={() => setTimeout(() => setPicker("merge"), 0)}>
                  <GitMerge /> Merge into…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={cmd.print} className="max-md:hidden">
                <Printer /> Print
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggleDetails}>
                <PanelRight /> {detailsOpen ? "Hide details" : "Show details"}
              </DropdownMenuItem>
              {writable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={cmd.toggleSpam}>
                    {conv.isSpam ? <ShieldCheck /> : <ShieldAlert />} {conv.isSpam ? "Not spam" : "Mark as spam"}
                    <Hint action="spam" />
                  </DropdownMenuItem>
                  {canDelete && (
                    <DropdownMenuItem variant={conv.isTrash ? "default" : "destructive"} onSelect={cmd.toggleTrash}>
                      {conv.isTrash ? <ArchiveRestore /> : <Trash2 />} {conv.isTrash ? "Restore" : "Move to trash"}
                      <Hint action="trash" />
                    </DropdownMenuItem>
                  )}
                  {canDelete && conv.isTrash && (
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                      <Trash2 /> Delete permanently
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <HeaderButton label={detailsOpen ? "Hide details" : "Show details"} onClick={onToggleDetails} active={detailsOpen} className="max-md:hidden">
            <PanelRight />
          </HeaderButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 text-xs md:px-4">
        {acc && (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-muted-foreground">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: acc.color }} />
            {acc.name}
          </span>
        )}
        {tm && (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-muted-foreground">
            <Users className="size-3" style={{ color: tm.color }} />
            {tm.name}
          </span>
        )}
        {conv.status === "closed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            <CircleCheck className="size-3" /> Closed
          </span>
        )}
        {snoozed && (
          <button type="button" onClick={() => setPicker("snooze")} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
            <Clock className="size-3" /> Snoozed until {untilLabel(conv.snoozedUntil)}
          </button>
        )}
        {conv.priority && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400">
            <Flag className="size-3 fill-current" /> Priority
          </span>
        )}
        {conv.isSpam && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">Spam</span>}
        {conv.isTrash && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">In trash</span>}
        {labels.map((l) => (
          <span key={l!.id} className="group/label inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2 text-foreground/80">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: l!.color }} />
            {l!.name}
            {writable && (
              <button type="button" aria-label={`Remove label ${l!.name}`} onClick={() => cmd.toggleLabel(l!.id, false)} className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100">
                <X className="size-2.5" />
              </button>
            )}
          </span>
        ))}
        {writable && (
          <button
            type="button"
            onClick={() => setPicker("label")}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-muted-foreground hover:border-solid hover:text-foreground md:hidden"
          >
            <Plus className="size-3" /> Label
          </button>
        )}
        {assignees.length > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground md:hidden">
            · {assignees.map((a) => (a!.id === meId ? "You" : firstName(a))).join(", ")}
          </span>
        )}
        {assignees.length > 0 && (
          <span className="ml-auto text-muted-foreground max-md:hidden">
            Assigned to {assignees.map((a) => (a!.id === meId ? "you" : memberName(a))).join(", ")}
          </span>
        )}
      </div>

      {writable && <MergeDialog conv={conv} open={picker === "merge"} onOpenChange={(o) => setPicker(o ? "merge" : null)} />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation permanently?</AlertDialogTitle>
            <AlertDialogDescription>All messages, comments and attachments are removed for everyone. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cmd.deleteForever}>
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
