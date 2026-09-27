import { cn } from "@/lib/utils"

/**
 * Tiny building blocks for the coded product mocks. Everything here is
 * decorative: mocks are wrapped in `aria-hidden` containers by `FeatureVisual`
 * and carry a text alternative there.
 */

export const people = {
  maya: { name: "Maya Chen", initials: "MC", color: "#16a34a" },
  jonas: { name: "Jonas Weber", initials: "JW", color: "#2563eb" },
  priya: { name: "Priya Patel", initials: "PP", color: "#d97706" },
  leo: { name: "Leo Martin", initials: "LM", color: "#7c3aed" },
  sam: { name: "Sam Rivera", initials: "SR", color: "#e11d48" },
  ada: { name: "Ada Novak", initials: "AN", color: "#0d9488" },
} as const

export type PersonKey = keyof typeof people

export const labelColors = {
  urgent: "#ef4444",
  vip: "#f59e0b",
  bug: "#8b5cf6",
  refund: "#0ea5e9",
  billing: "#10b981",
  lead: "#3b82f6",
  legal: "#64748b",
  returns: "#f97316",
} as const

export function Avatar({
  who,
  size = 24,
  ring,
  className,
}: {
  who: PersonKey | { initials: string; color: string }
  size?: number
  ring?: boolean
  className?: string
}) {
  const p = typeof who === "string" ? people[who] : who
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        ring && "ring-2 ring-card",
        className
      )}
      style={{ width: size, height: size, background: p.color, fontSize: Math.max(8, Math.round(size * 0.38)) }}
    >
      {p.initials}
    </span>
  )
}

/** Neutral customer avatar (initial on a tinted disc). */
export function Contact({ initials, size = 28, className }: { initials: string; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-muted-foreground",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  )
}

export function Label({
  name,
  color,
  className,
}: {
  name: string
  color: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border border-border bg-card px-1.5 py-px text-[10.5px] font-medium leading-4 text-foreground",
        className
      )}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  )
}

export function Key({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-card px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_var(--border)]",
        className
      )}
    >
      {children}
    </kbd>
  )
}

/** White card used as the base of most mocks. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]",
        className
      )}
    >
      {children}
    </div>
  )
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <span className="mk-typing-dot size-1 rounded-full bg-current" />
      <span className="mk-typing-dot size-1 rounded-full bg-current" />
      <span className="mk-typing-dot size-1 rounded-full bg-current" />
    </span>
  )
}

/** Light skeleton line standing in for body text. */
export function Line({ w = "100%", className }: { w?: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-foreground/[0.08]", className)} style={{ width: w }} />
}

export function Mention({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[3px] bg-brand-soft px-0.5 font-medium text-(--brand-ink)">{children}</span>
}
