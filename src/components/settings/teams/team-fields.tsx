"use client"

import { Dices, Hand, Repeat, Scale } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ColorSwatches } from "@/components/settings/color-picker"
import { FormField } from "@/components/settings/settings-ui"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type Strategy = "none" | "round_robin" | "least_busy" | "random"

export const STRATEGY_INFO: Record<Strategy, { label: string; description: string; icon: typeof Hand }> = {
  none: {
    label: "teamStrategyManual",
    description: "teamStrategyManualDescription",
    icon: Hand,
  },
  round_robin: {
    label: "teamStrategyRoundRobin",
    description: "teamStrategyRoundRobinDescription",
    icon: Repeat,
  },
  least_busy: {
    label: "teamStrategyLeastBusy",
    description: "teamStrategyLeastBusyDescription",
    icon: Scale,
  },
  random: {
    label: "teamStrategyRandom",
    description: "teamStrategyRandomDescription",
    icon: Dices,
  },
}

export function StrategyPicker({ value, onChange, idPrefix }: { value: Strategy; onChange: (v: Strategy) => void; idPrefix: string }) {
  const { t } = useI18n()
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
                {t(info.label as Parameters<typeof t>[0])}
              </span>
              <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{t(info.description as Parameters<typeof t>[0])}</span>
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
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("teamFieldName")} htmlFor={`${idPrefix}-name`} error={errors.name}>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={60}
          placeholder={t("teamFieldNamePlaceholder")}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          aria-invalid={!!errors.name}
        />
      </FormField>
      <FormField label={t("teamFieldDescription")} optional htmlFor={`${idPrefix}-description`} error={errors.description}>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          maxLength={280}
          rows={2}
          placeholder={t("teamFieldDescriptionPlaceholder")}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </FormField>
      <FormField label={t("teamFieldColor")} error={errors.color}>
        <ColorSwatches value={value.color} onChange={(color) => onChange({ ...value, color })} />
      </FormField>
      <FormField
        label={t("teamFieldAssignment")}
        error={errors.assignmentStrategy}
        description={t("teamFieldAssignmentDescription")}
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
