"use client"

import { useSyncExternalStore } from "react"
import type { ListFilters } from "@/lib/inbox/boxes"
import type { DraftInfo, DraftMode } from "@/lib/inbox/types"

/**
 * UI state shared across the inbox panes (list, conversation, sidebar,
 * dialogs, keyboard shortcuts). A tiny external store keeps unrelated
 * components from re-rendering (selectors) without adding a dependency.
 */
export type PickerKind = "label" | "assign" | "snooze" | "team" | "merge" | null
export type ComposerCommand = {
  conversationId: string
  mode: DraftMode | "comment"
  /** Reply to this message instead of the latest one */
  messageId?: string
  /** Open this draft (e.g. after "Undo send") */
  draft?: DraftInfo
  nonce: number
} | null
export type ComposeInit = { to?: { name?: string | null; email: string }[]; subject?: string; html?: string; draftId?: string; accountId?: string }

export type InboxUIState = {
  /** Conversation ids in the order shown by the list (for j/k and auto-advance) */
  listIds: string[]
  /** Box and filters of the visible list (to know whether a change removes the item) */
  listBox: string
  listFilters: ListFilters
  /** Multi-selection in the list */
  selected: Set<string>
  /** Anchor for shift-click range selection */
  anchorId: string | null
  /** Keyboard cursor in the list when no conversation is open */
  cursorId: string | null
  composer: ComposerCommand
  picker: PickerKind
  compose: { open: boolean; init?: ComposeInit; nonce: number }
  paletteOpen: boolean
  paletteQuery: string
  shortcutsOpen: boolean
  newChatOpen: boolean
  detailsOpen: boolean
  mobileNavOpen: boolean
}

const initial: InboxUIState = {
  listIds: [],
  listBox: "",
  listFilters: {},
  selected: new Set(),
  anchorId: null,
  cursorId: null,
  composer: null,
  picker: null,
  compose: { open: false, nonce: 0 },
  paletteOpen: false,
  paletteQuery: "",
  shortcutsOpen: false,
  newChatOpen: false,
  detailsOpen: false,
  mobileNavOpen: false,
}

let state: InboxUIState = initial
const listeners = new Set<() => void>()

export const inboxUI = {
  get: () => state,
  set(patch: Partial<InboxUIState> | ((s: InboxUIState) => Partial<InboxUIState>)) {
    const next = typeof patch === "function" ? patch(state) : patch
    let changed = false
    for (const k of Object.keys(next) as (keyof InboxUIState)[]) {
      if (state[k] !== next[k]) {
        changed = true
        break
      }
    }
    if (!changed) return
    state = { ...state, ...next }
    for (const l of listeners) l()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Ask the conversation view to open its composer (r / a / f / c shortcuts). */
  openComposer(conversationId: string, mode: DraftMode | "comment", opts: { messageId?: string; draft?: DraftInfo } = {}) {
    inboxUI.set({ composer: { conversationId, mode, ...opts, nonce: Date.now() } })
  },
  openCompose(init?: ComposeInit) {
    inboxUI.set((s) => ({ compose: { open: true, init, nonce: s.compose.nonce + 1 } }))
  },
  closeCompose() {
    inboxUI.set((s) => ({ compose: { ...s.compose, open: false } }))
  },
  clearSelection() {
    if (state.selected.size) inboxUI.set({ selected: new Set(), anchorId: null })
  },
}

export function useInboxUI<T>(selector: (s: InboxUIState) => T): T {
  return useSyncExternalStore(
    inboxUI.subscribe,
    () => selector(state),
    () => selector(initial)
  )
}
