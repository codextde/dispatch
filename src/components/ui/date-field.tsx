"use client"

import { useState } from "react"
import { enUS, it } from "date-fns/locale"
import { format, isValid, parse } from "date-fns"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ISO = "yyyy-MM-dd"

/**
 * Date picker built on the shared Calendar. The value is a `yyyy-MM-dd` string ("" when empty),
 * so it drops in wherever a native `<input type="date">` was used.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  placeholder,
  ariaLabel,
  disabled,
  className,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}) {
  const { locale } = useI18n()
  const it_ = locale === "it"
  const dateLocale = it_ ? it : enUS
  const [open, setOpen] = useState(false)
  const parsed = value ? parse(value, ISO, new Date()) : undefined
  const selected = parsed && isValid(parsed) ? parsed : undefined

  const outOfRange = (day: Date) => {
    const iso = format(day, ISO)
    return (min !== undefined && min !== "" && iso < min) || (max !== undefined && max !== "" && iso > max)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("h-8 justify-start gap-2 px-2.5 font-normal", !selected && "text-muted-foreground", className)}
        >
          <CalendarDays className="size-3.5 opacity-60" aria-hidden />
          <span className="truncate">
            {selected ? format(selected, "PP", { locale: dateLocale }) : (placeholder ?? (it_ ? "Seleziona data" : "Pick a date"))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (max ? parse(max, ISO, new Date()) : undefined)}
          disabled={outOfRange}
          onSelect={(day) => {
            onChange(day ? format(day, ISO) : "")
            setOpen(false)
          }}
          locale={dateLocale}
        />
        {value && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              {it_ ? "Cancella" : "Clear"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
