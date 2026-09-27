"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type RailStep = { id: string; label: string; hint?: string }

/** Vertical progress rail (desktop). Completed steps before `current` are clickable when `onSelect` is given. */
export function StepRail({
  steps,
  current,
  onSelect,
  canSelect,
}: {
  steps: RailStep[]
  current: number
  onSelect?: (index: number) => void
  canSelect?: (index: number) => boolean
}) {
  return (
    <ol className="relative space-y-1">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        const clickable = Boolean(onSelect) && i !== current && (canSelect ? canSelect(i) : done)
        const Tag = clickable ? "button" : "div"
        return (
          <li key={s.id} className="relative">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn("absolute top-8 left-[19px] h-[calc(100%-20px)] w-px bg-border", done && "bg-foreground/40")}
              />
            )}
            <Tag
              {...(clickable ? { type: "button" as const, onClick: () => onSelect?.(i) } : {})}
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left outline-none",
                clickable && "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-colors",
                  done && "border-foreground bg-foreground text-background",
                  active && "border-foreground bg-background text-foreground ring-4 ring-brand/25",
                  !done && !active && "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", !done && !active && "text-muted-foreground")}>{s.label}</span>
                {s.hint && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
              </span>
            </Tag>
          </li>
        )
      })}
    </ol>
  )
}

/** Compact progress for small screens. */
export function StepProgress({ steps, current }: { steps: RailStep[]; current: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono uppercase tracking-wider text-muted-foreground">
          Step {current + 1} of {steps.length}
        </span>
        <span className="font-medium">{steps[current]?.label}</span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.id} className={cn("h-1 flex-1 rounded-full bg-border transition-colors", i <= current && "bg-foreground")} />
        ))}
      </div>
    </div>
  )
}
