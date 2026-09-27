"use client"

import { useCallback } from "react"
import { shortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { primaryKey, type ShortcutAction } from "@/lib/inbox/shortcuts"
import { useInbox } from "./inbox-provider"

/**
 * Display label of an action's shortcut in the user's scheme ("N", "⇧U",
 * "G then I" → "G I"), or null when shortcuts are off or the action is unbound.
 */
export function useShortcutHint() {
  const { shortcutScheme, shortcutsEnabled } = useInbox()
  return useCallback(
    (action: ShortcutAction): string | null => {
      if (!shortcutsEnabled) return null
      const combo = primaryKey(shortcutScheme, action)
      return combo ? shortcutLabel(combo).join(" ") : null
    },
    [shortcutScheme, shortcutsEnabled]
  )
}

/** Raw combo (for components that format keys themselves). */
export function useShortcutCombo() {
  const { shortcutScheme, shortcutsEnabled } = useInbox()
  return useCallback(
    (action: ShortcutAction): string | undefined => (shortcutsEnabled ? (primaryKey(shortcutScheme, action) ?? undefined) : undefined),
    [shortcutScheme, shortcutsEnabled]
  )
}
