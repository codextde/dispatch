"use client"

import Link from "next/link"
import { memo, useRef, useState } from "react"
import { CircleCheck, Clock, Flag, Hash, MessageSquare, Paperclip, RotateCcw, Star } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/app/user-avatar"
import { listTime, memberName, participantName, shortName, untilLabel } from "@/lib/inbox/format"
import type { ConversationListItem } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useNow } from "@/hooks/inbox/use-now"
import { useInbox } from "../inbox-provider"

const SWIPE_TRIGGER = 88

export type RowProps = {
  item: ConversationListItem
  href: string
  active: boolean
  cursor: boolean
  selected: boolean
  selectionMode: boolean
  onClick: (e: React.MouseEvent, item: ConversationListItem) => void
  onToggleSelect: (item: ConversationListItem, shift: boolean) => void
  onSwipe?: (item: ConversationListItem, direction: "right" | "left") => void
}

function Senders({ item }: { item: ConversationListItem }) {
  const { account } = useInbox()
  const names = item.participants.slice(0, 3).map((p) => (item.participants.length > 1 ? shortName(p) : participantName(p)))
  if (names.length) {
    const more = item.participants.length - names.length
    return (
      <>
        {item.lastDirection === "outbound" && <span className="font-normal text-muted-foreground">To: </span>}
        {names.join(", ")}
        {more > 0 && <span className="font-normal text-muted-foreground"> +{more}</span>}
      </>
    )
  }
  if (item.lastFrom) return <>{participantName(item.lastFrom)}</>
  return <>{account(item.accountId)?.name ?? "Draft"}</>
}

export const ConversationRow = memo(function ConversationRow({
  item,
  href,
  active,
  cursor,
  selected,
  selectionMode,
  onClick,
  onToggleSelect,
  onSwipe,
}: RowProps) {
  const { member, label, account, meId } = useInbox()
  const [dx, setDx] = useState(0)
  const gesture = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null)
  const swiped = useRef(false)

  const isChat = item.kind === "chat"
  const acc = account(item.accountId)
  const now = useNow()
  const snoozed = item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now
  const labels = item.labelIds.map((id) => label(id)).filter(Boolean)
  const assignees = item.assigneeIds.map((id) => member(id)).filter(Boolean)
  const lead = item.participants[0] ?? item.lastFrom

  const directMember = isChat && !item.subject ? member(item.chatMemberIds.find((id) => id !== meId)) : undefined
  const chatTitle = isChat ? (item.subject ? item.subject : memberName(directMember, "Direct message")) : ""

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !onSwipe) return
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null }
    swiped.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const mx = e.clientX - g.x
    const my = e.clientY - g.y
    if (g.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) g.horizontal = Math.abs(mx) > Math.abs(my)
    if (g.horizontal) setDx(Math.max(-160, Math.min(160, mx)))
  }
  const onPointerEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g?.horizontal) return setDx(0)
    if (Math.abs(dx) >= SWIPE_TRIGGER && onSwipe) {
      swiped.current = true
      onSwipe(item, dx > 0 ? "right" : "left")
    }
    setDx(0)
  }

  const reveal = Math.min(1, Math.abs(dx) / SWIPE_TRIGGER)

  return (
    <div
      role="option"
      aria-selected={active || selected}
      data-cursor={cursor || undefined}
      className="relative overflow-hidden border-b border-border/60"
    >
      {dx !== 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center px-6 text-sm font-medium text-white",
            dx > 0 ? "justify-start bg-brand" : "justify-end bg-amber-500"
          )}
          style={{ opacity: 0.35 + reveal * 0.65 }}
        >
          {dx > 0 ? (
            <span className="flex items-center gap-2">
              {item.status === "closed" ? <RotateCcw className="size-5" /> : <CircleCheck className="size-5" />}
              {item.status === "closed" ? "Reopen" : "Close"}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Snooze <Clock className="size-5" />
            </span>
          )}
        </div>
      )}
      <Link
        href={href}
        prefetch={false}
        draggable={false}
        onClick={(e) => {
          if (swiped.current) {
            e.preventDefault()
            swiped.current = false
            return
          }
          onClick(e, item)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={cn(
          "group/row relative flex touch-pan-y gap-3 bg-card py-2.5 pr-3 pl-4 outline-none transition-[background-color] select-none max-md:py-3",
          dx === 0 && "transition-transform",
          "hover:bg-muted/60 focus-visible:bg-muted/60",
          active && "bg-accent hover:bg-accent",
          selected && "bg-brand-soft/60 hover:bg-brand-soft/80 dark:bg-brand-soft/40",
          cursor && !active && "shadow-[inset_2px_0_0_var(--brand)]"
        )}
      >
        {item.unread && <span className="absolute top-[18px] left-1.5 size-1.5 rounded-full bg-brand" aria-label="Unread" />}
        <div
          className="relative mt-0.5 shrink-0"
          onClick={(e) => {
            if (!selectionMode && !(e.target as HTMLElement).closest("[data-select]")) return
            e.preventDefault()
            e.stopPropagation()
            onToggleSelect(item, e.shiftKey)
          }}
        >
          <div className={cn("transition-opacity", (selectionMode || selected) && "opacity-0", "md:group-hover/row:opacity-0")}>
            {isChat ? (
              directMember ? (
                <UserAvatar name={directMember.name} email={directMember.email} src={directMember.avatarUrl} size="md" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Hash className="size-4" />
                </span>
              )
            ) : (
              <UserAvatar name={lead?.name} email={lead?.email ?? acc?.email} size="md" />
            )}
          </div>
          <div
            data-select
            className={cn(
              "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity",
              (selectionMode || selected) && "opacity-100",
              "md:group-hover/row:opacity-100"
            )}
          >
            <Checkbox
              checked={selected}
              aria-label={selected ? "Deselect conversation" : "Select conversation"}
              tabIndex={-1}
              className="size-[18px] bg-card"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", item.unread ? "font-semibold text-foreground" : "font-medium text-foreground/85")}>
              {isChat ? chatTitle : <Senders item={item} />}
              {!isChat && item.messageCount > 1 && <span className="ml-1 font-normal text-muted-foreground">{item.messageCount}</span>}
            </span>
            {acc && !isChat && (
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: acc.color }} title={acc.name} aria-hidden />
            )}
            <time className={cn("shrink-0 font-mono text-[11px] tabular-nums", item.unread ? "text-foreground" : "text-muted-foreground")} dateTime={item.lastActivityAt}>
              {listTime(item.lastActivityAt)}
            </time>
          </div>

          {!isChat && (
            <div className="mt-0.5 flex items-center gap-1.5">
              {item.priority && <Flag className="size-3 shrink-0 fill-red-500 text-red-500" aria-label="Priority" />}
              {item.hasDraft && <span className="shrink-0 text-[12px] font-medium text-red-600 dark:text-red-400">Draft</span>}
              {item.hasScheduled && <Clock className="size-3 shrink-0 text-info" aria-label="Scheduled" />}
              <span className={cn("min-w-0 truncate text-[13px]", item.unread ? "font-medium text-foreground" : "text-foreground/80")}>
                {item.subject || <span className="text-muted-foreground italic">(no subject)</span>}
              </span>
            </div>
          )}

          <div className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{item.snippet || " "}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              {snoozed && (
                <span className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400" title={`Snoozed until ${untilLabel(item.snoozedUntil)}`}>
                  <Clock className="size-3" />
                  <span className="max-md:hidden">{untilLabel(item.snoozedUntil)}</span>
                </span>
              )}
              {item.starred && <Star className="size-3 fill-amber-400 text-amber-400" aria-label="Starred" />}
              {item.hasAttachments && <Paperclip className="size-3" aria-label="Has attachments" />}
              {item.commentCount > 0 && !isChat && (
                <span className="flex items-center gap-0.5 text-[11px]" aria-label={`${item.commentCount} comments`}>
                  <MessageSquare className="size-3" />
                  {item.commentCount}
                </span>
              )}
            </span>
          </div>

          {(labels.length > 0 || assignees.length > 0) && (
            <div className="mt-1.5 flex items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {labels.slice(0, 3).map((l) => (
                  <span
                    key={l!.id}
                    className="inline-flex max-w-28 shrink-0 items-center gap-1 truncate rounded-full border border-border/80 px-1.5 py-px text-[10.5px] leading-4 text-foreground/80"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: l!.color }} />
                    <span className="truncate">{l!.name}</span>
                  </span>
                ))}
                {labels.length > 3 && <span className="text-[10.5px] text-muted-foreground">+{labels.length - 3}</span>}
              </div>
              {assignees.length > 0 && (
                <div className="flex shrink-0 -space-x-1.5" title={`Assigned to ${assignees.map((a) => memberName(a)).join(", ")}`}>
                  {assignees.slice(0, 3).map((a) => (
                    <UserAvatar key={a!.id} name={a!.name} email={a!.email} src={a!.avatarUrl} size="xs" className="ring-2 ring-card" />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  )
})
