"use client"

import { Command, Inbox, Keyboard, SquarePen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { inboxUI } from "@/hooks/inbox/store"
import { shortcutLabel } from "@/hooks/inbox/use-hotkeys"

/** Placeholder of the conversation pane when nothing is open (desktop). */
export function NoConversation() {
  return (
    <div className="dot-grid flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="flex flex-col items-center rounded-2xl border bg-card/90 px-10 py-9 shadow-sm backdrop-blur">
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-soft">
          <Inbox className="size-5 text-foreground" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">
          Select a conversation <span className="text-quiet">to get started</span>
        </h2>
        <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Use the keyboard to fly through your inbox.</p>
        <dl className="mt-5 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-left text-[13px]">
          <dt className="flex gap-1">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
          </dt>
          <dd className="text-muted-foreground">Move between conversations</dd>
          <dt className="flex gap-1">
            <Kbd>{shortcutLabel("mod+k")[0]}</Kbd>
          </dt>
          <dd className="text-muted-foreground">Search and commands</dd>
          <dt>
            <Kbd>N</Kbd>
          </dt>
          <dd className="text-muted-foreground">New message</dd>
          <dt>
            <Kbd>?</Kbd>
          </dt>
          <dd className="text-muted-foreground">All shortcuts</dd>
        </dl>
        <div className="mt-6 flex gap-2">
          <Button size="sm" onClick={() => inboxUI.openCompose()}>
            <SquarePen /> Compose
          </Button>
          <Button size="sm" variant="outline" onClick={() => inboxUI.set({ paletteOpen: true, paletteQuery: "" })}>
            <Command /> Search
          </Button>
          <Button size="sm" variant="ghost" aria-label="Keyboard shortcuts" onClick={() => inboxUI.set({ shortcutsOpen: true })}>
            <Keyboard />
          </Button>
        </div>
      </div>
    </div>
  )
}
