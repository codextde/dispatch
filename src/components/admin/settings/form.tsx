"use client"

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { saveSettingsAction } from "@/app/admin/settings/actions"
import type { EditableSection } from "@/server/admin/settings"
import { cn } from "@/lib/utils"

/**
 * Settings form framework for Admin → Settings.
 *
 * `initial` is the *redacted* settings section (secret `*Enc` fields hold a
 * masked preview). The hook keeps local state, detects changes, and saves only
 * the changed (non secret) fields plus any secrets the admin typed a new value
 * for — so values changed elsewhere (e.g. Stripe price ids) are never
 * overwritten with stale data.
 */

type Json = Record<string, unknown>

function isPlainObject(v: unknown): v is Json {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

/** Remove secret (`*Enc`) fields recursively. */
function stripSecrets(v: unknown): unknown {
  if (!isPlainObject(v)) return v
  const out: Json = {}
  for (const [k, val] of Object.entries(v)) if (!k.endsWith("Enc")) out[k] = stripSecrets(val)
  return out
}

/** Deep diff: fields of `next` that differ from `base` (objects recurse). */
function diff(base: unknown, next: unknown): Json | undefined {
  if (!isPlainObject(base) || !isPlainObject(next)) return undefined
  const out: Json = {}
  for (const [k, v] of Object.entries(next)) {
    if (k.endsWith("Enc")) continue
    const b = base[k]
    if (isPlainObject(v) && isPlainObject(b)) {
      const sub = diff(b, v)
      if (sub && Object.keys(sub).length) out[k] = sub
    } else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = v
  }
  return out
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (isPlainObject(cur) ? cur[key] : undefined), obj)
}

export type SettingsForm<T extends Json> = ReturnType<typeof useSettingsForm<T>>

export function useSettingsForm<T extends Json>(section: EditableSection, initial: T) {
  const router = useRouter()
  const initialJson = JSON.stringify(initial)
  const [synced, setSynced] = useState(initialJson)
  const [baseline, setBaseline] = useState<T>(initial)
  const [values, setValues] = useState<T>(initial)
  const [secrets, setSecrets] = useState<Record<string, string | undefined>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formKey, setFormKey] = useState(0)
  const [saving, startSaving] = useTransition()

  const changes = diff(stripSecrets(baseline), stripSecrets(values)) ?? {}
  const secretChanges = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== undefined)) as Record<string, string>
  const dirty = Object.keys(changes).length > 0 || Object.keys(secretChanges).length > 0

  // Server data changed (e.g. router.refresh after an action) while clean → adopt it.
  if (synced !== initialJson) {
    setSynced(initialJson)
    if (!dirty) {
      setBaseline(initial)
      setValues(initial)
      setFormKey((k) => k + 1)
    }
  }

  const set = useCallback((patch: Partial<T>) => {
    setValues((v) => ({ ...v, ...patch }))
    setErrors((e) => {
      const keys = Object.keys(patch)
      if (!keys.some((k) => Object.keys(e).some((ek) => ek === k || ek.startsWith(`${k}.`)))) return e
      return Object.fromEntries(Object.entries(e).filter(([ek]) => !keys.some((k) => ek === k || ek.startsWith(`${k}.`))))
    })
  }, [])

  /** Set a nested value by dot path, e.g. `setIn("google.clientId", "…")`. */
  const setIn = useCallback((path: string, value: unknown) => {
    setValues((v) => {
      const parts = path.split(".")
      const next: Json = { ...v }
      let cur = next
      for (const p of parts.slice(0, -1)) {
        cur[p] = { ...((cur[p] as Json) ?? {}) }
        cur = cur[p] as Json
      }
      cur[parts[parts.length - 1]!] = value
      return next as T
    })
    setErrors((e) => {
      if (!(path in e)) return e
      const rest = { ...e }
      delete rest[path]
      return rest
    })
  }, [])

  const setSecret = useCallback((field: string, value: string | undefined) => {
    setSecrets((s) => ({ ...s, [field]: value }))
  }, [])

  function reset(next: T) {
    setBaseline(next)
    setValues(next)
    setSecrets({})
    setErrors({})
    setFormKey((k) => k + 1)
  }

  const discard = () => reset(baseline)

  const save = () =>
    new Promise<boolean>((resolve) => {
      startSaving(async () => {
        try {
          const res = await saveSettingsAction({ section, values: changes, secrets: secretChanges })
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {})
            toast.error(res.error)
            resolve(false)
            return
          }
          reset(res.data as T)
          setSynced(JSON.stringify(res.data))
          toast.success("Settings saved")
          router.refresh()
          resolve(true)
        } catch {
          toast.error("Could not reach the server. Try again.")
          resolve(false)
        }
      })
    })

  // Warn before leaving with unsaved changes; ⌘/Ctrl+S saves.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("keydown", onKey)
    }
  }, [dirty])

  /** Field error by path (server errors come as `field`, `values.field` or nested paths). */
  const error = (path: string) => errors[path] ?? errors[`values.${path}`]

  /** Masked preview of a stored secret from the saved settings. */
  const secretPreview = (path: string) => {
    const v = getPath(baseline, path)
    return typeof v === "string" ? v : ""
  }

  return {
    section,
    values,
    baseline,
    set,
    setIn,
    secrets,
    setSecret,
    secretPreview,
    dirty,
    saving,
    save,
    discard,
    error,
    errors,
    formKey,
  }
}

/** Sticky bottom bar shown while the form has unsaved changes. */
export function SettingsSaveBar({
  form,
  className,
}: {
  form: { dirty: boolean; saving: boolean; save: () => Promise<boolean>; discard: () => void }
  className?: string
}) {
  if (!form.dirty && !form.saving) return <div aria-hidden className="h-4" />
  return (
    <div className={cn("sticky bottom-0 z-20 -mx-1 mt-6 pb-[max(env(safe-area-inset-bottom),1rem)]", className)}>
      <div
        role="region"
        aria-label="Unsaved changes"
        className="flex animate-in items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg shadow-black/5 fade-in slide-in-from-bottom-2 duration-200 sm:px-4 dark:shadow-black/40"
      >
        <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Unsaved changes
          <span className="ml-2 hidden font-mono text-[11px] font-normal text-muted-foreground sm:inline">⌘S to save</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={form.discard} disabled={form.saving}>
          Discard
        </Button>
        <Button type="submit" size="sm" disabled={form.saving}>
          {form.saving && <Spinner />}
          Save changes
        </Button>
      </div>
    </div>
  )
}

/** `<form>` wrapper wiring submit → save and rendering the save bar. */
export function SettingsFormShell({
  form,
  children,
  className,
}: {
  form: { dirty: boolean; saving: boolean; save: () => Promise<boolean>; discard: () => void }
  children: React.ReactNode
  className?: string
}) {
  return (
    <form
      noValidate
      className={cn("grid gap-6", className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (form.dirty) void form.save()
      }}
    >
      {children}
      <SettingsSaveBar form={form} />
    </form>
  )
}

/** className for SettingField inside a multi-column grid (uniform padding, rows align). */
export const GRID_FIELD = "py-2 first:pt-2 last:pb-2"

/**
 * One setting: label + description with the control either beside it
 * (`inline`, for switches and short inputs) or below it (`stacked`).
 */
export function SettingField({
  label,
  description,
  htmlFor,
  error,
  layout = "stacked",
  children,
  className,
  controlClassName,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor?: string
  error?: string
  layout?: "inline" | "stacked"
  children: React.ReactNode
  className?: string
  controlClassName?: string
}) {
  const descId = useId()
  if (layout === "inline") {
    return (
      <div className={cn("flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0", className)}>
        <div className="min-w-0">
          <Label htmlFor={htmlFor} className="text-sm leading-snug font-medium">
            {label}
          </Label>
          {description && (
            <p id={descId} className="mt-1 text-[13px] leading-snug text-muted-foreground text-pretty">
              {description}
            </p>
          )}
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        <div className={cn("shrink-0 pt-0.5", controlClassName)}>{children}</div>
      </div>
    )
  }
  return (
    <div className={cn("grid gap-1.5 py-3.5 first:pt-0 last:pb-0", className)}>
      <Label htmlFor={htmlFor} className="text-sm leading-snug font-medium">
        {label}
      </Label>
      <div className={cn("min-w-0", controlClassName)}>{children}</div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        description && <p className="text-[13px] leading-snug text-muted-foreground text-pretty">{description}</p>
      )}
    </div>
  )
}

/** Inline switch setting. */
export function SwitchField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  error,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  error?: string
}) {
  return (
    <SettingField layout="inline" label={label} description={description} htmlFor={id} error={error}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </SettingField>
  )
}

/** Integer input with an optional unit suffix. Emits NaN-safe integers (empty → 0). */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  suffix,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  className?: string
  "aria-invalid"?: boolean
}) {
  return (
    <div className={cn("relative w-full sm:w-44", className)}>
      <Input
        id={id}
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        aria-invalid={ariaInvalid}
        className={cn("tabular-nums", suffix && "pr-16")}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 9)
          onChange(digits === "" ? 0 : Number(digits))
        }}
        onBlur={() => {
          if (min !== undefined && value < min) onChange(min)
          if (max !== undefined && value > max) onChange(max)
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** Inline result line for test buttons. */
export function TestResult({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null
  return (
    <p
      role="status"
      className={cn(
        "text-[13px] break-words",
        result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
      )}
    >
      {result.message}
    </p>
  )
}

/** Muted callout box for hints and warnings inside panels. */
export function Callout({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: "neutral" | "warn" | "brand"
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "neutral" && "border-border bg-surface/60 text-muted-foreground",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
        tone === "brand" && "border-brand/30 bg-brand-soft text-foreground",
        className
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
