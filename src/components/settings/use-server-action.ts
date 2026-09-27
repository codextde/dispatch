"use client"

import { useCallback, useState, useTransition } from "react"
import { toast } from "sonner"
import type { ActionResult } from "@/server/action"

export type { ActionResult }

type RunOptions<T> = {
  /** Toast shown on success (string or derived from the result). */
  success?: string | ((data: T) => string)
  onSuccess?: (data: T) => void
  onError?: (error: string, fieldErrors?: Record<string, string>) => void
  /** Suppress the error toast (e.g. when errors are shown inline). */
  silentError?: boolean
}

/**
 * Run a server action (created with `action()` from src/server/action.ts)
 * inside a transition, with toasts for the result.
 *
 *   const { pending, run } = useServerAction()
 *   run(() => updateLabel({ slug, id, name }), { success: "Label saved" })
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const run = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          let res: ActionResult<T>
          try {
            res = await fn()
          } catch (err) {
            res = { ok: false, error: err instanceof Error ? err.message : "Something went wrong" }
          }
          if (res.ok) {
            setFieldErrors({})
            const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success
            if (msg) toast.success(msg)
            opts.onSuccess?.(res.data)
          } else {
            setFieldErrors(res.fieldErrors ?? {})
            if (!opts.silentError) toast.error(res.error)
            opts.onError?.(res.error, res.fieldErrors)
          }
          resolve(res)
        })
      }),
    []
  )

  return { pending, run, fieldErrors, setFieldErrors }
}
