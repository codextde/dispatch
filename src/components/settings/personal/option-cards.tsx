"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type OptionCard<T extends string> = {
  value: T
  label: string
  description?: string
  icon?: React.ReactNode
  preview?: React.ReactNode
  disabled?: boolean
}

/** Radio group rendered as selectable cards (keyboard: arrow keys move, space selects). */
export function OptionCards<T extends string>({
  value,
  onChange,
  options,
  label,
  columns = 3,
}: {
  value: T
  onChange: (v: T) => void
  options: OptionCard<T>[]
  label: string
  columns?: 2 | 3
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const move = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const idx = (from + dir * i + options.length) % options.length
      if (!options[idx]!.disabled) {
        refs.current[idx]?.focus()
        onChange(options[idx]!.value)
        return
      }
    }
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2.5", columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={cn(
              "group relative flex flex-col gap-2 rounded-lg border bg-background p-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20",
              selected && "border-foreground/40 bg-surface/60 ring-1 ring-foreground/15 dark:bg-input/40"
            )}
          >
            {o.preview}
            <span className="flex items-start gap-2">
              {o.icon && <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{o.description}</span>}
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected ? "border-foreground bg-foreground text-background" : "border-input"
                )}
              >
                {selected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
