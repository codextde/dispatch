"use client"

import { useCallback, useEffect, useState } from "react"

/** useState persisted in localStorage (hydrates after mount to avoid SSR mismatches). */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      /* ignore */
    }
  }, [key])

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          /* ignore */
        }
        return resolved
      })
    },
    [key]
  )

  return [value, set]
}
