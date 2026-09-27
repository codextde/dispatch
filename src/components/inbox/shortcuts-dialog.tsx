"use client"

import { Fragment } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { shortcutLabel } from "@/hooks/inbox/use-hotkeys"

type Shortcut = { keys: string[]; label: string }
type Group = { title: string; items: Shortcut[] }

const GROUPS: Group[] = [
  {
    title: "Navigation",
    items: [
      { keys: ["j", "ArrowDown"], label: "Next conversation" },
      { keys: ["k", "ArrowUp"], label: "Previous conversation" },
      { keys: ["Enter", "o"], label: "Open conversation" },
      { keys: ["Escape"], label: "Back to the list" },
      { keys: ["g i"], label: "Go to Inbox" },
      { keys: ["g a"], label: "Go to Assigned to me" },
      { keys: ["g s"], label: "Go to Starred" },
      { keys: ["g d"], label: "Go to Drafts" },
      { keys: ["g m"], label: "Go to Mentions" },
      { keys: ["g c"], label: "Go to Chats" },
      { keys: ["g t"], label: "Go to your team" },
      { keys: ["/", "mod+k"], label: "Search & commands" },
    ],
  },
  {
    title: "Conversation",
    items: [
      { keys: ["e"], label: "Close / reopen" },
      { keys: ["r"], label: "Reply" },
      { keys: ["a"], label: "Reply all" },
      { keys: ["f"], label: "Forward" },
      { keys: ["c"], label: "Comment" },
      { keys: ["s"], label: "Star" },
      { keys: ["h"], label: "Snooze" },
      { keys: ["l"], label: "Labels" },
      { keys: ["i"], label: "Assign" },
      { keys: ["m"], label: "Assign to me" },
      { keys: ["u"], label: "Mark as unread" },
      { keys: ["#"], label: "Move to trash" },
      { keys: ["!"], label: "Mark as spam" },
      { keys: ["x"], label: "Select" },
    ],
  },
  {
    title: "Composer",
    items: [
      { keys: ["mod+Enter"], label: "Send" },
      { keys: ["mod+shift+Enter"], label: "Send & close" },
      { keys: ["Escape"], label: "Close the composer" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: ["n"], label: "New message" },
      { keys: ["mod+shift+n"], label: "New chat" },
      { keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
]

function Keys({ combo }: { combo: string }) {
  const parts = shortcutLabel(combo)
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-[11px] text-muted-foreground">then</span>}
          <Kbd className="min-w-6 font-mono text-[11px]">{part}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

/** "?" — every keyboard shortcut of the inbox, grouped. */
export function ShortcutsDialog() {
  const open = useInboxUI((s) => s.shortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : inboxUI.set({ shortcutsOpen: false }))}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Keyboard shortcuts <span className="text-quiet">for flying through your inbox</span>
          </DialogTitle>
          <DialogDescription className="text-[13px]">Shortcuts are paused while you type in a field.</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="gap-x-10 md:columns-2">
            {GROUPS.map((group) => (
              <section key={group.title} aria-labelledby={`shortcuts-${group.title}`} className="mb-6 break-inside-avoid last:mb-0">
                <h3 id={`shortcuts-${group.title}`} className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {group.title}
                </h3>
                <dl className="divide-y divide-border/60">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 py-1.5">
                      <dt className="min-w-0 truncate text-[13px]">{item.label}</dt>
                      <dd className="flex shrink-0 items-center gap-1.5">
                        {item.keys.map((combo, i) => (
                          <Fragment key={combo}>
                            {i > 0 && <span className="text-[11px] text-muted-foreground">or</span>}
                            <Keys combo={combo} />
                          </Fragment>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
        <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          You can turn keyboard shortcuts off in Settings → Profile.
        </p>
      </DialogContent>
    </Dialog>
  )
}
