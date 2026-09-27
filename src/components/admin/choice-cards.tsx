"use client"

import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type ChoiceOption<V extends string> = {
  value: V
  title: string
  description?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  badge?: string
  disabled?: boolean
}

/** Accessible radio group rendered as selectable cards. */
export function ChoiceCards<V extends string>({
  value,
  onChange,
  options,
  columns = 2,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  value: V
  onChange: (value: V) => void
  options: ChoiceOption<V>[]
  columns?: 1 | 2 | 3
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as V)}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "grid gap-2",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        className
      )}
    >
      {options.map((o) => {
        const Icon = o.icon
        return (
          <RadioGroupPrimitive.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className={cn(
              "group relative flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-left outline-none transition-colors",
              "hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-[state=checked]:border-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {Icon && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors group-data-[state=checked]:border-transparent group-data-[state=checked]:bg-foreground group-data-[state=checked]:text-background">
                <Icon className="size-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 pr-5 text-sm font-medium">
                {o.title}
                {o.badge && (
                  <span className="rounded-sm bg-brand-soft px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-foreground">
                    {o.badge}
                  </span>
                )}
              </span>
              {o.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{o.description}</span>}
            </span>
            <span
              className="absolute top-3 right-3 flex size-4 items-center justify-center rounded-full border border-input transition-colors group-data-[state=checked]:border-foreground group-data-[state=checked]:bg-foreground"
              aria-hidden
            >
              <Check className="size-2.5 text-background opacity-0 group-data-[state=checked]:opacity-100" strokeWidth={3} />
            </span>
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}
