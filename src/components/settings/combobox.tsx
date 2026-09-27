"use client"

import * as React from "react"
import { useId, useState } from "react"
import { ChevronsUpDown, X } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ComboOption = {
  value: string
  label: string
  /** Extra text used for searching and shown muted */
  hint?: string
  icon?: React.ReactNode
  group?: string
  disabled?: boolean
}

const triggerClass =
  "flex min-h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent py-1 pr-2 pl-2.5 text-left text-sm transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"

function groupOptions(options: ComboOption[]) {
  const groups = new Map<string, ComboOption[]>()
  for (const o of options) {
    const g = o.group ?? ""
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(o)
  }
  return [...groups.entries()]
}

/** Searchable single select. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  id,
  disabled,
  clearable,
  "aria-invalid": ariaInvalid,
  contentClassName,
}: {
  options: ComboOption[]
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  id?: string
  disabled?: boolean
  clearable?: boolean
  "aria-invalid"?: boolean
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(triggerClass, className)}
        >
          <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-muted-foreground")}>
            {selected?.icon}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className={cn("w-(--radix-popover-trigger-width) min-w-56 p-0", contentClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groupOptions(options).map(([group, opts]) => (
              <CommandGroup key={group || "_"} heading={group || undefined}>
                {opts.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    disabled={o.disabled}
                    data-checked={o.value === value}
                    onSelect={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                  >
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Searchable multi select with removable chips. */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  className,
  id,
  disabled,
  maxChips = 6,
}: {
  options: ComboOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  id?: string
  disabled?: boolean
  maxChips?: number
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selected = value.map((v) => options.find((o) => o.value === v)).filter(Boolean) as ComboOption[]
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(triggerClass, "h-auto", className)}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {selected.slice(0, maxChips).map((o) => (
              <span
                key={o.value}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-surface pr-1 pl-1.5 text-xs"
              >
                {o.icon}
                <span className="truncate">{o.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${o.label}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(o.value)
                  }}
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
            {selected.length > maxChips && (
              <span className="text-xs text-muted-foreground">+{selected.length - maxChips} more</span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groupOptions(options).map(([group, opts]) => (
              <CommandGroup key={group || "_"} heading={group || undefined}>
                {opts.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    disabled={o.disabled}
                    data-checked={value.includes(o.value)}
                    onSelect={() => toggle(o.value)}
                  >
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
