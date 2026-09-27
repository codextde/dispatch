"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { PanelLeft } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useHotkeys } from "@/hooks/inbox/use-hotkeys"
import { usePersistentState } from "@/hooks/inbox/use-persistent-state"
import { useRealtime } from "@/hooks/inbox/use-realtime"
import type { Bootstrap } from "@/lib/inbox/types"
import { InboxProvider, useInbox } from "./inbox-provider"
import { ResizeHandle } from "./resize-handle"
import { Sidebar } from "./sidebar"

const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false })
const ComposeDialog = dynamic(() => import("./compose-dialog").then((m) => m.ComposeDialog), { ssr: false })
const ShortcutsDialog = dynamic(() => import("./shortcuts-dialog").then((m) => m.ShortcutsDialog), { ssr: false })
const NewChatDialog = dynamic(() => import("./new-chat-dialog").then((m) => m.NewChatDialog), { ssr: false })

const SIDEBAR = { min: 200, max: 360, default: 240 }

/**
 * The mail app chrome: sidebar (resizable & collapsible on desktop, a sheet
 * below `lg`), realtime connection, global shortcuts and app-wide dialogs.
 * Area pages (list + conversation) render as children.
 */
export function MailShell({ slug, bootstrap, children }: { slug: string; bootstrap: Bootstrap; children: React.ReactNode }) {
  return (
    <InboxProvider slug={slug} initialBootstrap={bootstrap}>
      <ShellInner>{children}</ShellInner>
    </InboxProvider>
  )
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { slug, meId, bootstrap, shortcutsEnabled } = useInbox()
  const router = useRouter()
  const [width, setWidth] = usePersistentState("dispatch:sidebar:width", SIDEBAR.default)
  const [collapsed, setCollapsed] = usePersistentState("dispatch:sidebar:collapsed", false)
  const mobileOpen = useInboxUI((s) => s.mobileNavOpen)
  const composeOpen = useInboxUI((s) => s.compose.open)
  const paletteOpen = useInboxUI((s) => s.paletteOpen)
  const shortcutsOpen = useInboxUI((s) => s.shortcutsOpen)
  const newChatOpen = useInboxUI((s) => s.newChatOpen)

  const prefs = bootstrap.me.preferences as { notifications?: { desktop?: boolean; mentions?: boolean; assignments?: boolean } }
  useRealtime(slug, {
    meId,
    notificationPrefs: prefs.notifications,
    onOpenConversation: (id) => router.push(`/w/${slug}/inbox/${id}`),
  })

  // Warm up the lazily loaded dialogs so the first ⌘K / compose opens instantly.
  useEffect(() => {
    const warm = () => {
      void import("./command-palette")
      void import("./compose-dialog")
      void import("./shortcuts-dialog")
      void import("./new-chat-dialog")
    }
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(warm, 1500)
    return () => clearTimeout(t)
  }, [])

  const go = (box: string) => router.push(`/w/${slug}/${box}`)
  const firstTeam = bootstrap.teams.find((t) => t.isMember) ?? bootstrap.teams[0]
  useHotkeys(
    [
      { keys: ["mod+k"], allowInInput: true, handler: () => inboxUI.set((s) => ({ paletteOpen: !s.paletteOpen, paletteQuery: "" })) },
      { keys: ["/"], handler: () => inboxUI.set({ paletteOpen: true, paletteQuery: "" }) },
      { keys: ["n"], handler: () => inboxUI.openCompose() },
      { keys: ["?", "shift+?"], handler: () => inboxUI.set({ shortcutsOpen: true }) },
      { keys: ["g i"], handler: () => go("inbox") },
      { keys: ["g a"], handler: () => go("assigned") },
      { keys: ["g s"], handler: () => go("starred") },
      { keys: ["g d"], handler: () => go("drafts") },
      { keys: ["g m"], handler: () => go("mentions") },
      { keys: ["g c"], handler: () => go("chats") },
      { keys: ["g t"], handler: () => (firstTeam ? go(`team.${firstTeam.id}`) : go("unassigned")) },
      { keys: ["mod+shift+n"], allowInInput: true, handler: () => inboxUI.set({ newChatOpen: true }) },
    ],
    shortcutsEnabled
  )
  // ⌘K must work even with shortcuts turned off.
  useHotkeys(
    [{ keys: ["mod+k"], allowInInput: true, handler: () => inboxUI.set((s) => ({ paletteOpen: !s.paletteOpen, paletteQuery: "" })) }],
    !shortcutsEnabled
  )

  return (
    <div className="flex h-full min-h-0 bg-background">
      {!collapsed && (
        <>
          <aside className="hidden h-full shrink-0 border-r border-sidebar-border lg:block" style={{ width }} aria-label="Sidebar">
            <Sidebar onCollapse={() => setCollapsed(true)} />
          </aside>
          <ResizeHandle
            className="hidden lg:block"
            value={width}
            onChange={setWidth}
            min={SIDEBAR.min}
            max={SIDEBAR.max}
            defaultValue={SIDEBAR.default}
            label="Resize sidebar"
          />
        </>
      )}
      {collapsed && (
        <div className="hidden h-full w-11 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2 lg:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setCollapsed(false)} aria-label="Expand sidebar">
                <PanelLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={(open) => inboxUI.set({ mobileNavOpen: open })}>
        <SheetContent side="left" className="w-[85vw] max-w-80 gap-0 p-0 lg:hidden" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Mailboxes, teams, inboxes, labels and chats</SheetDescription>
          <Sidebar onNavigate={() => inboxUI.set({ mobileNavOpen: false })} />
        </SheetContent>
      </Sheet>

      <main className="flex h-full min-w-0 flex-1 flex-col">{children}</main>

      {paletteOpen && <CommandPalette />}
      {composeOpen && <ComposeDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      {newChatOpen && <NewChatDialog />}
    </div>
  )
}

/** Hamburger that opens the sidebar sheet below `lg` (also when the desktop sidebar is collapsed). */
export function MobileNavButton({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? "-ml-1 size-10 lg:hidden"}
      aria-label="Open navigation"
      onClick={() => inboxUI.set({ mobileNavOpen: true })}
    >
      <PanelLeft />
    </Button>
  )
}
