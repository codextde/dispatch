"use client"

import { useSyncExternalStore } from "react"

/**
 * Shared "current time" that ticks every 30 seconds, for render-time
 * comparisons (is this snooze in the future?) without calling Date.now()
 * during render.
 */
let now = typeof window === "undefined" ? 0 : Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, 30_000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0
  )
}
