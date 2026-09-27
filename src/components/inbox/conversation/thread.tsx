"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { MessageSquare } from "lucide-react"
import type { ConversationThread, ThreadComment, ThreadEvent, ThreadMessage } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useInbox } from "../inbox-provider"
import { CommentItem } from "./comment-item"
import { EventItem } from "./event-item"
import { MessageItem } from "./message-item"

type Entry =
  | { kind: "message"; at: number; item: ThreadMessage }
  | { kind: "comment"; at: number; item: ThreadComment }
  | { kind: "event"; at: number; item: ThreadEvent }

/** Events that are noise in the timeline (the message itself shows them). */
const HIDDEN_EVENTS = new Set(["scheduled"])

function dayLabel(d: Date) {
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, d.getFullYear() === new Date().getFullYear() ? "EEEE, d MMMM" : "d MMMM yyyy")
}

function DaySeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{dayLabel(date)}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * Chronological timeline of a conversation: email messages (collapsible,
 * latest expanded), internal comments and compact timeline events.
 */
export function Thread({ thread, highlightId }: { thread: ConversationThread; highlightId?: string | null }) {
  const { meId } = useInbox()
  const conv = thread.conversation
  const isChat = conv.kind === "chat"
  const canReply = conv.level !== "read" && !isChat

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...thread.messages.map((m) => ({ kind: "message" as const, at: new Date(m.date).getTime(), item: m })),
      ...thread.comments.map((c) => ({ kind: "comment" as const, at: new Date(c.createdAt).getTime(), item: c })),
      ...thread.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).map((e) => ({ kind: "event" as const, at: new Date(e.createdAt).getTime(), item: e })),
    ]
    return list.sort((a, b) => a.at - b.at)
  }, [thread.messages, thread.comments, thread.events])

  // Day separators and chat grouping (consecutive messages by the same author within 5 minutes).
  const rows = useMemo(() => {
    const dayOf = (e: Entry | undefined) => (e ? new Date(e.at).toDateString() : "")
    return entries.map((entry, i) => {
      const prev = entries[i - 1]
      const newDay = dayOf(entry) !== dayOf(prev)
      const compact =
        isChat &&
        !newDay &&
        entry.kind === "comment" &&
        prev?.kind === "comment" &&
        prev.item.authorId === entry.item.authorId &&
        entry.at - prev.at < 5 * 60_000
      return { entry, newDay, compact }
    })
  }, [entries, isChat])

  const lastMessageId = thread.messages[thread.messages.length - 1]?.id
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    if (lastMessageId) ids.add(lastMessageId)
    for (const m of thread.messages) if (m.status !== "sent" && m.status !== "received") ids.add(m.id)
    if (thread.messages.length <= 2) for (const m of thread.messages) ids.add(m.id)
    return ids
  })
  // Newly arrived messages open automatically.
  const [seenLast, setSeenLast] = useState(lastMessageId)
  if (lastMessageId !== seenLast) {
    setSeenLast(lastMessageId)
    if (lastMessageId && !expanded.has(lastMessageId)) setExpanded(new Set([...expanded, lastMessageId]))
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Scroll: highlighted comment, otherwise the latest entry.
  const endRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (scrolledFor.current === conv.id) return
    scrolledFor.current = conv.id
    requestAnimationFrame(() => {
      const target = highlightId ? document.getElementById(`comment-${highlightId}`) : null
      if (target) target.scrollIntoView({ block: "center" })
      else if (isChat || entries[entries.length - 1]?.kind !== "message") endRef.current?.scrollIntoView({ block: "end" })
      else document.getElementById(`message-${lastMessageId}`)?.scrollIntoView({ block: "start" })
    })
  }, [conv.id, highlightId, isChat, entries, lastMessageId])

  // Keep chats pinned to the bottom when new messages arrive.
  const count = entries.length
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) {
      const last = entries[entries.length - 1]
      if (isChat || (last?.kind === "comment" && last.item.authorId === meId)) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
    }
    prevCount.current = count
  }, [count, entries, isChat, meId])

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="size-5" />
        </span>
        <p className="text-sm">{isChat ? "Say hello 👋" : "No messages yet."}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col", isChat ? "gap-0" : "gap-2")}>
      {/* Mentions of the current user stand out. meId is a UUID (safe to interpolate). */}
      <style>{`.comment-body .mention[data-id="${meId}"]{background:color-mix(in oklch,var(--brand) 38%,transparent);color:var(--foreground)}`}</style>
      {rows.map(({ entry: e, newDay, compact }) => {
        const separator = newDay ? <DaySeparator key={`day-${e.at}`} date={new Date(e.at)} /> : null
        let node: React.ReactNode
        if (e.kind === "message") {
          node = (
            <div key={e.item.id} id={`message-${e.item.id}`} className="scroll-mt-4">
              <MessageItem message={e.item} conversationId={conv.id} expanded={expanded.has(e.item.id)} onToggle={() => toggle(e.item.id)} canReply={canReply} />
            </div>
          )
        } else if (e.kind === "comment") {
          node = <CommentItem key={e.item.id} comment={e.item} conversationId={conv.id} compact={compact} highlighted={highlightId === e.item.id} variant={isChat ? "chat" : "comment"} />
        } else {
          node = <EventItem key={e.item.id} event={e.item} />
        }
        return separator ? [separator, node] : node
      })}
      <div ref={endRef} />
    </div>
  )
}
