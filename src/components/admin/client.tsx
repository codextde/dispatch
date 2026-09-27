"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Check, ChevronLeft, ChevronRight, Copy, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type ActionResultLike<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Run a server action returning an ActionResult: pending state, error toast,
 * success toast and a router refresh so server components re-render.
 */
export function useAdminAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function run<T>(
    fn: () => Promise<ActionResultLike<T>>,
    opts: { success?: string | ((data: T) => string); refresh?: boolean; onSuccess?: (data: T) => void } = {}
  ) {
    return new Promise<ActionResultLike<T>>((resolve) => {
      startTransition(async () => {
        try {
          const res = await fn()
          if (!res.ok) toast.error(res.error)
          else {
            const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success
            if (msg) toast.success(msg)
            opts.onSuccess?.(res.data)
            if (opts.refresh !== false) router.refresh()
          }
          resolve(res)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Something went wrong"
          toast.error(message)
          resolve({ ok: false, error: message })
        }
      })
    })
  }
  return { pending, run }
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "icon-sm",
}: {
  value: string
  label?: string
  className?: string
  size?: "icon-sm" | "icon-xs" | "sm"
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={className}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error("Couldn't copy to clipboard")
        }
      }}
    >
      {copied ? <Check className="text-brand" /> : <Copy />}
      {size === "sm" && (copied ? "Copied" : label)}
    </Button>
  )
}

/** A read-only value with a copy button (URLs, ids, secrets to register elsewhere). */
export function CopyField({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface py-0.5 pr-0.5 pl-2.5", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={value}>
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  )
}

/** Build a URL with updated search params (resets `page` unless it is being set). */
function useParamUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === undefined || v === "" || v === "all") next.delete(k)
      else next.set(k, v)
    }
    if (!("page" in updates)) next.delete("page")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
}

/** Search box bound to a URL search param (debounced). */
export function SearchParamInput({
  param = "q",
  placeholder = "Search…",
  className,
}: {
  param?: string
  placeholder?: string
  className?: string
}) {
  const params = useSearchParams()
  const update = useParamUpdater()
  const initial = params.get(param) ?? ""
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        className="bg-card pr-8 pl-8"
        onChange={(e) => {
          const v = e.target.value
          setValue(v)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => update({ [param]: v.trim() }), 300)
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue("")
            update({ [param]: null })
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Select bound to a URL search param. `all` (or empty) removes the param. */
export function FilterSelect({
  param,
  options,
  label,
  className,
}: {
  param: string
  options: { value: string; label: string }[]
  label: string
  className?: string
}) {
  const params = useSearchParams()
  const update = useParamUpdater()
  const value = params.get(param) ?? "all"
  return (
    <Select value={value} onValueChange={(v) => update({ [param]: v })}>
      <SelectTrigger size="sm" className={cn("w-full bg-card sm:w-40", className)} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: all</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Prev/next pagination driven by the `page` search param. */
export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString())
    if (p <= 1) next.delete("page")
    else next.set("page", String(p))
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-[13px] text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} of {new Intl.NumberFormat("en-US").format(total)}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)} scroll={false}>
              <ChevronLeft /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft /> Previous
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)} scroll={false}>
              Next <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Button that asks for confirmation (optionally type-to-confirm) and then runs
 * a server action.
 */
export function ConfirmButton<T>({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  destructive = false,
  variant,
  size = "sm",
  className,
  disabled,
  action,
  success,
  onSuccess,
}: {
  children: React.ReactNode
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  /** Require typing this exact text to enable the confirm button */
  confirmText?: string
  destructive?: boolean
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  size?: "sm" | "default" | "xs"
  className?: string
  disabled?: boolean
  action: () => Promise<ActionResultLike<T>>
  success?: string
  onSuccess?: (data: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const { pending, run } = useAdminAction()
  const blocked = Boolean(confirmText) && typed.trim() !== confirmText
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setTyped("")
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={variant ?? (destructive ? "destructive" : "outline")} size={size} className={className} disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {confirmText && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-text" className="text-[13px] text-muted-foreground">
              Type <span className="font-mono font-medium text-foreground">{confirmText}</span> to confirm
            </label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending || blocked}
            onClick={async (e) => {
              e.preventDefault()
              const res = await run(action, { success, onSuccess })
              if (res.ok) setOpen(false)
            }}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** A plain HTML form POST (for route handlers such as impersonation). */
export function PostButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  className,
  disabled,
  fields,
}: {
  action: string
  children: React.ReactNode
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  size?: "sm" | "default" | "xs"
  className?: string
  disabled?: boolean
  fields?: Record<string, string>
}) {
  const [submitting, setSubmitting] = useState(false)
  return (
    <form action={action} method="post" onSubmit={() => setSubmitting(true)} className="contents">
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={size} className={className} disabled={disabled || submitting}>
        {submitting && <Spinner />}
        {children}
      </Button>
    </form>
  )
}
