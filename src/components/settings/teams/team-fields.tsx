"use client"

import { Dices, Hand, Repeat, Scale } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ColorSwatches } from "@/components/settings/color-picker"
import { FormField } from "@/components/settings/settings-ui"
import { cn } from "@/lib/utils"

export type Strategy = "none" | "round_robin" | "least_busy" | "random"

export const STRATEGY_INFO: Record<Strategy, { label: string; description: string; icon: typeof Hand }> = {
  none: {
    label: "Manual",
    description: "Conversations routed to the team stay unassigned until someone picks them up.",
    icon: Hand,
  },
  round_robin: {
    label: "Round robin",
    description: "Assign to team members in turn, so everyone gets the same number of conversations.",
    icon: Repeat,
  },
  least_busy: {
    label: "Least busy",
    description: "Assign to the member with the fewest open conversations right now.",
    icon: Scale,
  },
  random: {
    label: "Random",
    description: "Assign to a randomly picked team member.",
    icon: Dices,
  },
}

export function StrategyPicker({ value, onChange, idPrefix }: { value: Strategy; onChange: (v: Strategy) => void; idPrefix: string }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as Strategy)} className="grid gap-2 sm:grid-cols-2">
      {(Object.keys(STRATEGY_INFO) as Strategy[]).map((key) => {
        const info = STRATEGY_INFO[key]
        const id = `${idPrefix}-strategy-${key}`
        return (
          <label
            key={key}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              value === key && "border-foreground/30 bg-surface/80"
            )}
          >
            <RadioGroupItem id={id} value={key} className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <info.icon className="size-3.5 text-muted-foreground" />
                {info.label}
              </span>
              <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{info.description}</span>
            </span>
          </label>
        )
      })}
    </RadioGroup>
  )
}

export type TeamDraft = { name: string; description: string; color: string; assignmentStrategy: Strategy }

export function TeamFields({
  value,
  onChange,
  errors,
  idPrefix,
}: {
  value: TeamDraft
  onChange: (v: TeamDraft) => void
  errors: Record<string, string>
  idPrefix: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField label="Name" htmlFor={`${idPrefix}-name`} error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={60}
          placeholder="e.g. Support, Billing, Sales"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          aria-invalid={!!errors.name}
        />
      </FormField>
      <FormField label="Description" optional htmlFor={`${idPrefix}-description`} error={errors.description}>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={280}
          rows={2}
          placeholder="What does this team handle?"
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </FormField>
      <FormField label="Color" error={errors.color}>
        <ColorSwatches value={value.color} onChange={(color) => onChange({ ...value, color })} />
      </FormField>
      <FormField
        label="Auto-assignment"
        error={errors.assignmentStrategy}
        description="Used when a rule or inbox routes a conversation to this team."
      >
        <StrategyPicker
          idPrefix={idPrefix}
          value={value.assignmentStrategy}
          onChange={(assignmentStrategy) => onChange({ ...value, assignmentStrategy })}
        />
      </FormField>
    </div>
  )
}
