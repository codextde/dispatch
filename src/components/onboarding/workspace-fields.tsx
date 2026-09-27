"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, CircleAlert } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type SlugCheckResult = { slug: string; available: boolean; reason?: "short" | "reserved" | "taken"; suggestion?: string }
type CheckFn = (input: { slug: string }) => Promise<{ ok: true; data: SlugCheckResult } | { ok: false; error: string }>

/** Client mirror of `slugify` in src/server/orgs.ts (the server re-validates). */
export function slugifyClient(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export type WorkspaceFieldsValue = { name: string; slug: string; slugEdited: boolean }

/**
 * Workspace name + URL with a live availability check. `onStatus` reports
 * whether the current slug is known to be available (for disabling submit).
 */
export function WorkspaceFields({
  value,
  onChange,
  check,
  appHost,
  onStatus,
  autoFocus,
  error,
}: {
  value: WorkspaceFieldsValue
  onChange: (value: WorkspaceFieldsValue) => void
  check: CheckFn
  appHost: string
  onStatus?: (status: "idle" | "checking" | "available" | "unavailable") => void
  autoFocus?: boolean
  error?: string | null
}) {
  const [checked, setChecked] = useState<{ slug: string; result: SlugCheckResult | null } | null>(null)
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  })

  // Derived: idle (too short), checking (no answer for this slug yet) or the server's answer
  const slug = value.slug
  const answer = checked?.slug === slug ? checked.result : undefined
  const state: "idle" | "checking" | "available" | "unavailable" =
    slug.length < 2 || answer === null ? "idle" : answer === undefined ? "checking" : answer.available ? "available" : "unavailable"
  const status = { state, result: answer ?? undefined }

  useEffect(() => {
    onStatusRef.current?.(state)
  }, [state])

  useEffect(() => {
    if (slug.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await check({ slug }).catch(() => null)
      if (!cancelled) setChecked({ slug, result: res && res.ok ? res.data : null })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [slug, check])

  const reason = status.result?.reason
  const suggestion = status.result?.suggestion

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="ws-name" className="text-[13px]">
          Workspace name
        </Label>
        <Input
          id="ws-name"
          value={value.name}
          autoFocus={autoFocus}
          maxLength={80}
          placeholder="Acme Inc."
          className="h-10 bg-card"
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            const name = e.target.value
            onChange({ name, slug: value.slugEdited ? value.slug : slugifyClient(name), slugEdited: value.slugEdited })
          }}
        />
        <p className="text-xs text-muted-foreground">Usually your company or team name. You can change it later.</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ws-slug" className="text-[13px]">
          Workspace URL
        </Label>
        <div
          className={cn(
            "flex h-10 items-center overflow-hidden rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
            status.state === "unavailable" && "border-destructive"
          )}
        >
          <span className="hidden h-full shrink-0 items-center border-r border-border bg-surface px-2.5 font-mono text-[12.5px] text-muted-foreground sm:flex">
            {appHost}/w/
          </span>
          <input
            id="ws-slug"
            value={value.slug}
            maxLength={40}
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby="ws-slug-status"
            aria-invalid={status.state === "unavailable"}
            placeholder="acme"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground"
            onChange={(e) =>
              onChange({
                name: value.name,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").slice(0, 40),
                slugEdited: true,
              })
            }
            onBlur={() => onChange({ ...value, slug: slugifyClient(value.slug) })}
          />
          <span className="flex w-9 shrink-0 items-center justify-center" aria-hidden>
            {status.state === "checking" && <Spinner className="size-3.5 text-muted-foreground" />}
            {status.state === "available" && <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
            {status.state === "unavailable" && <CircleAlert className="size-4 text-destructive" />}
          </span>
        </div>
        <p id="ws-slug-status" className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {status.state === "available" && (
            <span className="text-emerald-700 dark:text-emerald-400">
              {appHost}/w/{value.slug} is available
            </span>
          )}
          {status.state === "unavailable" && (
            <span className="text-destructive">
              {reason === "reserved" ? "That address is reserved." : "That address is already taken."}{" "}
              {suggestion && (
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => onChange({ ...value, slug: suggestion, slugEdited: true })}
                >
                  Use {suggestion}
                </button>
              )}
            </span>
          )}
          {status.state === "idle" && value.slug.length > 0 && value.slug.length < 2 && "Use at least 2 characters."}
          {status.state === "idle" && !value.slug && "Lowercase letters, numbers and dashes."}
        </p>
      </div>
      {error && (
        <p role="alert" className="-mt-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
