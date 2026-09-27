import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Presentational building blocks for the admin panel. Server-compatible (no
 * hooks) so pages can render them directly.
 */

export function MicroLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("font-mono text-[11px] uppercase tracking-wider text-muted-foreground", className)}>{children}</div>
}

/** Page header with a two-tone title: `title` (strong) + `quiet` (muted). */
export function AdminPageHeader({
  eyebrow,
  title,
  quiet,
  description,
  actions,
  back,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  quiet?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  back?: { href: string; label: string }
  className?: string
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8", className)}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-3.5" /> {back.label}
          </Link>
        )}
        {eyebrow && <MicroLabel className="mb-2">{eyebrow}</MicroLabel>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words md:text-[28px] md:leading-tight">
          {title}
          {quiet && <span className="text-quiet"> {quiet}</span>}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Hairline-bordered panel with an optional header row. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4 md:p-5", bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: "default" | "brand" | "warn" | "error"
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <MicroLabel className="truncate">{label}</MicroLabel>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      </div>
      <div
        className={cn(
          "mt-3 text-2xl font-semibold tracking-tight",
          tone === "brand" && "text-brand",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "error" && "text-destructive"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </>
  )
  const cls = "block rounded-lg border border-border bg-card p-4 transition-colors"
  return href ? (
    <Link href={href} className={cn(cls, "outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const TONES = {
  ok: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  brand: "border-brand/30 bg-brand-soft text-foreground",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "border-border bg-muted text-muted-foreground",
} as const
const DOTS = {
  ok: "bg-emerald-500",
  brand: "bg-brand",
  warn: "bg-amber-500",
  error: "bg-destructive",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/60",
} as const

export type Tone = keyof typeof TONES

export function StatusBadge({
  tone = "neutral",
  dot = true,
  pulse = false,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  pulse?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone], pulse && "animate-pulse-dot")} aria-hidden />}
      {children}
    </span>
  )
}

/** Definition list for detail pages. */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; mono?: boolean }[]
  className?: string
}) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-1 gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt className="text-[13px] text-muted-foreground">{it.label}</dt>
          <dd className={cn("min-w-0 text-sm break-words", it.mono && "font-mono text-[13px]")}>{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-surface">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      )}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground text-pretty">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

/** Simple responsive table wrapper with hairline borders and horizontal scroll on small screens. */
export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
      </div>
    </div>
  )
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-border bg-surface/60 px-3 text-left align-middle font-mono text-[10.5px] font-normal uppercase tracking-wider whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4",
        className
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4", className)}>
      {children}
    </td>
  )
}

/** Compact number formatting: 1234 → "1,234" */
export function formatNumber(n: number | bigint | null | undefined) {
  return new Intl.NumberFormat("en-US").format(Number(n ?? 0))
}

export function formatMoney(cents: number, currency = "usd") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}
