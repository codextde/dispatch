"use client"

import { useEffect, useRef, useCallback, useSyncExternalStore } from "react"

/**
 * Minimal keyboard shortcut handling for the inbox.
 *
 * Key syntax: "j", "#", "?", "Enter", "Escape", "ArrowDown", "mod+k"
 * (⌘ on macOS, Ctrl elsewhere), "shift+u", and two-key sequences "g i".
 * Shortcuts are ignored while typing in inputs/editors and inside open
 * dialogs/menus, unless `allowInInput` is set (e.g. "mod+k").
 */
export type Hotkey = {
  keys: string | string[]
  handler: (e: KeyboardEvent) => void
  allowInInput?: boolean
  /** Return false to let the event pass through */
  when?: () => boolean
}

const SEQUENCE_TIMEOUT = 1200
let sequencePrefix: { key: string; at: number } | null = null

/** Platform check for event handlers. Don't use it while rendering: the server can't know it (see `useIsMac`). */
export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const noopSubscribe = () => () => {}
/**
 * Hydration-safe platform check for rendering: the server (and the hydration
 * pass) render the non-Mac labels, then Macs switch to ⌘/⌥ right after.
 */
export function useIsMac(): boolean {
  return useSyncExternalStore(noopSubscribe, isMac, () => false)
}

/** `(combo) => ["⌘K"]` bound to the current platform, for use while rendering. */
export function useShortcutLabel() {
  const mac = useIsMac()
  return useCallback((combo: string) => shortcutLabel(combo, mac), [mac])
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type
    return !["checkbox", "radio", "button", "submit", "reset"].includes(type)
  }
  return false
}

function inOverlay(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el?.closest?.('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-slot="popover-content"]')
}

function matchesCombo(combo: string, e: KeyboardEvent) {
  const parts = combo.split("+")
  const key = parts.pop()!
  const mods = new Set(parts.map((p) => p.toLowerCase()))
  const wantMod = mods.has("mod")
  const modPressed = isMac() ? e.metaKey : e.ctrlKey
  if (wantMod !== modPressed) return false
  if (!wantMod && (e.metaKey || e.ctrlKey)) return false
  if (mods.has("alt") !== e.altKey) return false
  const isLetter = /^[a-z]$/i.test(key)
  if (isLetter) {
    if (mods.has("shift") !== e.shiftKey) return false
    return e.key.toLowerCase() === key.toLowerCase()
  }
  if (mods.has("shift") && !e.shiftKey) return false
  return e.key === key
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  const ref = useRef(hotkeys)
  useEffect(() => {
    ref.current = hotkeys
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const typing = isTypingTarget(e.target)
      const overlay = inOverlay(e.target)
      const now = Date.now()
      const prefix = sequencePrefix && now - sequencePrefix.at < SEQUENCE_TIMEOUT ? sequencePrefix.key : null

      for (const hk of ref.current) {
        const list = Array.isArray(hk.keys) ? hk.keys : [hk.keys]
        for (const combo of list) {
          const seq = combo.split(" ")
          if ((typing || overlay) && !hk.allowInInput) continue
          if (seq.length === 2) {
            if (prefix === seq[0] && matchesCombo(seq[1]!, e)) {
              if (hk.when && !hk.when()) continue
              sequencePrefix = null
              e.preventDefault()
              hk.handler(e)
              return
            }
            continue
          }
          if (matchesCombo(combo, e)) {
            if (hk.when && !hk.when()) continue
            e.preventDefault()
            sequencePrefix = null
            hk.handler(e)
            return
          }
        }
      }
      // Remember a potential sequence prefix (single plain key, not typing).
      if (!typing && !overlay && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        sequencePrefix = { key: e.key.toLowerCase(), at: now }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}

/** Display label for a shortcut, e.g. "mod+k" → "⌘K" / "Ctrl K". Prefer `useShortcutLabel()` in components. */
export function shortcutLabel(combo: string, mac = isMac()): string[] {
  return combo.split(" ").map((part) =>
    part
      .split("+")
      .map((k) => {
        if (k === "mod") return mac ? "⌘" : "Ctrl"
        if (k === "shift") return "⇧"
        if (k === "alt") return mac ? "⌥" : "Alt"
        if (k === "Enter") return "↵"
        if (k === "Escape") return "Esc"
        if (k === "ArrowDown") return "↓"
        if (k === "ArrowUp") return "↑"
        return k.length === 1 ? k.toUpperCase() : k
      })
      .join(mac ? "" : " ")
  )
}
