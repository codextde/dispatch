"use client"

import { Suspense } from "react"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { usePersistentState } from "@/hooks/inbox/use-persistent-state"
import { ConversationList } from "./list/conversation-list"
import { ResizeHandle } from "./resize-handle"

const LIST = { min: 300, max: 640, default: 380 }

/**
 * Two panes of a mailbox: conversation list and the open conversation.
 * Below `md` only one pane is visible at a time (list, or the conversation
 * with a back button).
 */
export function MailPanes({ box, children }: { box: string; children: React.ReactNode }) {
  const params = useParams<{ conversationId?: string }>()
  const open = !!params.conversationId
  const [width, setWidth] = usePersistentState("dispatch:list:width", LIST.default)

  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label="Conversations"
        className={cn(
          "h-full min-w-0 flex-col bg-card md:flex md:w-[min(var(--list-width),46vw)] md:shrink-0 md:border-r",
          open ? "hidden" : "flex w-full"
        )}
        style={{ "--list-width": `${width}px` } as React.CSSProperties}
      >
        <Suspense>
          <ConversationList box={box} />
        </Suspense>
      </section>
      <ResizeHandle className="hidden md:block" value={width} onChange={setWidth} min={LIST.min} max={LIST.max} defaultValue={LIST.default} label="Resize conversation list" />
      <section aria-label="Conversation" className={cn("h-full min-w-0 flex-1 flex-col", open ? "flex" : "hidden md:flex")}>
        {children}
      </section>
    </div>
  )
}
