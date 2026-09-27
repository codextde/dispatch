"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleCheck, Ellipsis, Lock, RotateCcw, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { AiSummary } from "@/components/ai/ai-summary"
import { ApiClientError } from "@/lib/api-client"
import { firstName } from "@/lib/inbox/format"
import { keysFor, type ShortcutAction } from "@/lib/inbox/shortcuts"
import type { ComposingKind, ConversationDetail } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useThread } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { useConversationActions } from "@/hooks/inbox/use-conversation-actions"
import { useHotkeys } from "@/hooks/inbox/use-hotkeys"
import { usePersistentState } from "@/hooks/inbox/use-persistent-state"
import { usePresenceHeartbeat, useViewers } from "@/hooks/inbox/use-realtime"
import { useMediaQuery } from "@/hooks/inbox/use-media-query"
import { ConversationComposer } from "../composer/conversation-composer"
import { useInbox } from "../inbox-provider"
import { ChatHeader } from "./chat-header"
import { ConversationHeader } from "./conversation-header"
import { DetailsPanel } from "./details-panel"
import { Thread } from "./thread"
import { useConversationCommands } from "./use-conversation-commands"

function ThreadSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 md:px-6">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function TypingIndicator({ conversationId }: { conversationId: string }) {
  const { member, meId } = useInbox()
  const writers = useViewers(conversationId).filter((v) => v.composing && v.userId !== meId)
  if (!writers.length) return null
  const replying = writers.filter((w) => w.composing === "reply").map((w) => firstName(member(w.userId)))
  const commenting = writers.filter((w) => w.composing === "comment").map((w) => firstName(member(w.userId)))
  const parts = [
    replying.length ? `${replying.join(", ")} ${replying.length > 1 ? "are" : "is"} writing a reply` : "",
    commenting.length ? `${commenting.join(", ")} ${commenting.length > 1 ? "are" : "is"} commenting` : "",
  ].filter(Boolean)
  return (
    <div className="flex items-center gap-2 px-6 pb-1 text-[11.5px] text-muted-foreground" aria-live="polite">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1 animate-pulse-dot rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </span>
      {parts.join(" · ")}…
    </div>
  )
}

export function ConversationView({ id, box }: { id: string; box: string }) {
  const { slug, shortcutsEnabled, shortcutScheme } = useInbox()
  const router = useRouter()
  const { find, run } = useConversationActions()
  const { data: thread, error, isPending } = useThread(slug, id)
  const placeholder = find(id)
  const conv: ConversationDetail | undefined = thread?.conversation
  const [composing, setComposing] = useState<ComposingKind>(null)
  const [detailsOpen, setDetailsOpen] = usePersistentState("dispatch:details:open", false)
  const cmd = useConversationCommands(conv, box)
  const [highlight] = useState(() => (typeof window !== "undefined" && window.location.hash.startsWith("#comment-") ? window.location.hash.slice(9) : null))
  const wide = useMediaQuery("(min-width: 1280px)")

  usePresenceHeartbeat(slug, conv ? id : null, composing)

  // Mark as read when opened (and whenever new activity arrives while open).
  const markedAt = useRef<string | null>(null)
  useEffect(() => {
    if (!conv?.unread || markedAt.current === conv.lastActivityAt) return
    markedAt.current = conv.lastActivityAt
    run([conv.id], { read: true })
  }, [conv?.unread, conv?.id, conv?.lastActivityAt, run])

  useEffect(() => {
    inboxUI.set({ cursorId: id })
  }, [id])

  const title = conv ? (conv.kind === "chat" ? conv.subject || "Chat" : conv.subject || "(no subject)") : null
  useEffect(() => {
    if (title) document.title = `${title} · Dispatch`
  }, [title])

  const writable = !!conv && conv.level !== "read" && conv.kind === "email"
  const k = (action: ShortcutAction) => keysFor(shortcutScheme, action)
  useHotkeys(
    [
      { keys: k("back"), when: () => !inboxUI.get().selected.size, handler: () => cmd?.back() },
      { keys: k("close"), when: () => writable, handler: () => cmd?.toggleStatus() },
      { keys: k("star"), handler: () => cmd?.toggleStar() },
      { keys: k("snooze"), when: () => writable, handler: () => inboxUI.set({ picker: "snooze" }) },
      { keys: k("label"), when: () => writable, handler: () => inboxUI.set({ picker: "label" }) },
      { keys: k("assign"), when: () => writable, handler: () => inboxUI.set({ picker: "assign" }) },
      { keys: k("moveTeam"), when: () => writable, handler: () => inboxUI.set({ picker: "team" }) },
      { keys: k("assignMe"), when: () => writable, handler: () => cmd?.assignToMe() },
      { keys: k("mute"), handler: () => cmd?.toggleMute() },
      { keys: k("markRead"), handler: () => cmd?.markRead() },
      { keys: k("markUnread"), handler: () => cmd?.markUnread() },
      { keys: k("trash"), when: () => writable, handler: () => cmd?.toggleTrash() },
      { keys: k("spam"), when: () => writable, handler: () => cmd?.toggleSpam() },
      { keys: k("reply"), when: () => writable, handler: () => inboxUI.openComposer(id, "reply") },
      { keys: k("replyAll"), when: () => writable, handler: () => inboxUI.openComposer(id, "reply_all") },
      { keys: k("forward"), when: () => writable, handler: () => inboxUI.openComposer(id, "forward") },
      { keys: k("comment"), handler: () => inboxUI.openComposer(id, "comment") },
      { keys: k("priority"), when: () => writable, handler: () => cmd?.togglePriority() },
    ],
    shortcutsEnabled && !!conv
  )

  if (error) {
    const notFound = error instanceof ApiClientError && (error.status === 404 || error.status === 403)
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center border-b px-2 md:hidden">
          <Button variant="ghost" size="icon" className="size-10" aria-label="Back" onClick={() => router.push(`/w/${slug}/${box}`)}>
            <ArrowLeft />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Lock className="size-5 text-muted-foreground" />
          </span>
          <p className="text-[15px] font-semibold tracking-tight">{notFound ? "Conversation not found" : "Could not load this conversation"}</p>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            {notFound ? "It may have been deleted or merged, or you don't have access to its inbox." : error.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push(`/w/${slug}/${box}`)}>
            Back to list
          </Button>
        </div>
      </div>
    )
  }

  if (isPending || !thread || !conv || !cmd) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 md:px-4">
          <Button variant="ghost" size="icon" className="-ml-1 size-10 md:hidden" aria-label="Back" onClick={() => router.push(`/w/${slug}/${box}`)}>
            <ArrowLeft />
          </Button>
          {placeholder ? <h1 className="truncate text-base font-semibold tracking-tight">{placeholder.subject || "(no subject)"}</h1> : <Skeleton className="h-4 w-64" />}
        </div>
        <ThreadSkeleton />
      </div>
    )
  }

  const isChat = conv.kind === "chat"
  const toggleDetails = () => setDetailsOpen(!detailsOpen)

  const mobileActions = writable ? (
    <>
      <Button variant="ghost" className="h-11 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={cmd.toggleStatus}>
        {conv.status === "closed" ? <RotateCcw className="size-5" /> : <CircleCheck className="size-5" />}
        {conv.status === "closed" ? "Reopen" : "Close"}
      </Button>
      <Button variant="ghost" className="h-11 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => inboxUI.set({ picker: "assign" })}>
        <UserPlus className="size-5" />
        Assign
      </Button>
      <Button variant="ghost" className="h-11 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => setDetailsOpen(true)}>
        <Ellipsis className="size-5" />
        Details
      </Button>
    </>
  ) : null

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {isChat ? <ChatHeader conv={conv} onToggleDetails={toggleDetails} /> : <ConversationHeader conv={conv} cmd={cmd} detailsOpen={detailsOpen} onToggleDetails={toggleDetails} />}
        <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain print:overflow-visible", isChat ? "bg-card" : "bg-background")}>
          <div className={cn("mx-auto w-full px-3 py-4 md:px-6 md:py-6", isChat ? "max-w-4xl" : "max-w-3xl")}>
            {!isChat && conv.messageCount > 0 && <AiSummary slug={slug} conversationId={conv.id} className="mb-3" />}
            <Thread key={conv.id} thread={thread} highlightId={highlight} />
          </div>
        </div>
        <div className={cn("print:hidden", isChat && "bg-card")}>
          <TypingIndicator conversationId={conv.id} />
          <ConversationComposer
            key={conv.id}
            thread={thread}
            onComposing={setComposing}
            onSentAndClosed={() => router.replace(cmd.nextHref())}
            mobileActions={mobileActions}
          />
        </div>
      </div>

      {detailsOpen && wide && (
        <aside className="w-80 shrink-0 border-l print:hidden" aria-label="Conversation details">
          <DetailsPanel thread={thread} onClose={() => setDetailsOpen(false)} />
        </aside>
      )}
      <Sheet open={detailsOpen && !wide} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-sm gap-0 p-0 xl:hidden" showCloseButton={false}>
          <SheetTitle className="sr-only">Conversation details</SheetTitle>
          <SheetDescription className="sr-only">Contact, conversation details and activity</SheetDescription>
          <DetailsPanel thread={thread} onClose={() => setDetailsOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
