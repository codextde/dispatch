"use client"

import { useId } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import {
  CONDITION_FIELD_ORDER,
  CONDITION_FIELDS,
  operatorLabel,
  type ConditionField,
  type ConditionOperator,
} from "@/components/settings/rules/definitions"
import type { ConditionDraft } from "@/components/settings/rules/drafts"
import { cn } from "@/lib/utils"

export function ConditionRow({
  draft,
  index,
  errors,
  accountOptions,
  labelOptions,
  onChange,
  onRemove,
}: {
  draft: ConditionDraft
  index: number
  errors: Record<string, string>
  accountOptions: ComboOption[]
  labelOptions: ComboOption[]
  onChange: (patch: Partial<ConditionDraft>) => void
  onRemove: () => void
}) {
  const uid = useId()
  const def = CONDITION_FIELDS[draft.field]
  const p = `conditions.${index}`
  const fieldError = errors[`${p}.header`] ?? errors[`${p}.operator`] ?? errors[`${p}.value`] ?? errors[`${p}.field`]

  const changeField = (field: ConditionField) => {
    const next = CONDITION_FIELDS[field]
    const operator = next.operators.includes(draft.operator) ? draft.operator : next.operators[0]!
    onChange({ field, operator, value: next.kind === def.kind ? draft.value : "" })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex flex-wrap gap-2 rounded-lg border bg-background p-2 sm:flex-nowrap sm:items-center",
          fieldError && "border-destructive/50"
        )}
        data-invalid={fieldError ? true : undefined}
      >
        <Select value={draft.field} onValueChange={(v) => changeField(v as ConditionField)}>
          <SelectTrigger className="order-1 w-[calc(50%-4px)] sm:w-36" aria-label={`Condition ${index + 1} field`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_FIELD_ORDER.map((f) => (
              <SelectItem key={f} value={f}>
                {CONDITION_FIELDS[f].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.field === "header" && (
          <Input
            aria-label={`Condition ${index + 1} header name`}
            placeholder="List-Id"
            value={draft.header}
            spellCheck={false}
            aria-invalid={Boolean(errors[`${p}.header`])}
            onChange={(e) => onChange({ header: e.target.value })}
            className="order-3 w-full font-mono text-[13px] sm:order-2 sm:w-36"
          />
        )}
        <Select value={draft.operator} onValueChange={(v) => onChange({ operator: v as ConditionOperator })}>
          <SelectTrigger className="order-2 w-[calc(50%-4px)] sm:order-3 sm:w-44" aria-label={`Condition ${index + 1} operator`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.operators.map((op) => (
              <SelectItem key={op} value={op}>
                {operatorLabel(draft.field, op)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="order-4 flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
          <div className="min-w-0 flex-1">
            {def.kind === "text" && (
              <Input
                id={`${uid}-value`}
                aria-label={`Condition ${index + 1} value`}
                value={draft.value}
                placeholder={draft.operator === "matches" ? "^invoice-\\d+$" : def.placeholder}
                spellCheck={false}
                aria-invalid={Boolean(errors[`${p}.value`])}
                onChange={(e) => onChange({ value: e.target.value })}
                className={cn(draft.operator === "matches" && "font-mono text-[13px]")}
              />
            )}
            {def.kind === "account" && (
              <Combobox
                options={accountOptions}
                value={draft.value || null}
                onChange={(v) => onChange({ value: v ?? "" })}
                placeholder={accountOptions.length ? "Select inbox" : "No inboxes connected"}
                searchPlaceholder="Search inboxes…"
                aria-invalid={Boolean(errors[`${p}.value`])}
              />
            )}
            {def.kind === "label" && (
              <Combobox
                options={labelOptions}
                value={draft.value || null}
                onChange={(v) => onChange({ value: v ?? "" })}
                placeholder={labelOptions.length ? "Select label" : "No labels yet"}
                searchPlaceholder="Search labels…"
                aria-invalid={Boolean(errors[`${p}.value`])}
              />
            )}
            {def.kind === "boolean" && (
              <span className="block px-1 text-[13px] text-muted-foreground">
                {draft.field === "business_hours"
                  ? def.hint
                  : draft.operator === "is_true"
                    ? "The email has at least one attachment"
                    : "The email has no attachments"}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove condition ${index + 1}`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X />
          </Button>
        </div>
      </div>
      {fieldError && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {fieldError}
        </p>
      )}
    </div>
  )
}
