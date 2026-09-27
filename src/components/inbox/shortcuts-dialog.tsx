"use client"

import { Fragment } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { shortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { SHORTCUTS, type ShortcutAction, type ShortcutGroup, type ShortcutScheme } from "@/lib/inbox/shortcuts"
import { useInbox } from "./inbox-provider"

type Shortcut = { keys: string[]; label: string }
type Group = { title: string; items: Shortcut[] }

const COMPOSER: Group = {
  title: "Composer",
  items: [
    { keys: ["mod+Enter"], label: "Send" },
    { keys: ["mod+shift+Enter"], label: "Send & close" },
    { keys: ["Escape"], label: "Close the composer" },
  ],
}

/** Help groups for the active scheme, from the shared shortcut table. */
function groupsFor(scheme: ShortcutScheme): Group[] {
  const order: ShortcutGroup[] = ["Navigation", "Conversation", "General"]
  const groups = order.map((title) => ({
    title,
    items: (Object.keys(SHORTCUTS) as ShortcutAction[])
      .filter((a) => SHORTCUTS[a].group === title && SHORTCUTS[a][scheme].length > 0)
      .map((a) => ({ keys: SHORTCUTS[a][scheme], label: SHORTCUTS[a].label })),
  }))
  return [groups[0]!, groups[1]!, COMPOSER, groups[2]!]
}

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
  const { shortcutScheme, shortcutsEnabled } = useInbox()
  const groups = groupsFor(shortcutScheme)
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : inboxUI.set({ shortcutsOpen: false }))}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Keyboard shortcuts <span className="text-quiet">for flying through your inbox</span>
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {!shortcutsEnabled
              ? "Keyboard shortcuts are turned off — only ⌘K / Ctrl K works."
              : shortcutScheme === "gmail"
                ? "Gmail-compatible scheme. Shortcuts are paused while you type in a field."
                : "Shortcuts are paused while you type in a field."}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="gap-x-10 md:columns-2">
            {groups.map((group) => (
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
          Switch between the Dispatch and Gmail schemes, or turn shortcuts off, in Settings → Profile.
        </p>
      </DialogContent>
    </Dialog>
  )
}
