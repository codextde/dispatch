"use client"

import { useMemo, useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

function listTimeZones(): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf("timeZone")
  } catch {
    zones = []
  }
  return zones.includes("UTC") ? zones : ["UTC", ...zones]
}

function offsetLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")
    return part?.value.replace("GMT", "UTC") ?? ""
  } catch {
    return ""
  }
}

/** Searchable IANA time zone picker. */
export function TimezoneSelect({ id, value, onChange }: { id?: string; value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false)
  const zones = useMemo(() => listTimeZones().map((tz) => ({ tz, offset: offsetLabel(tz) })), [])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal sm:w-80"
        >
          <span className="truncate">{value.replace(/_/g, " ")}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            {zones.map(({ tz, offset }) => (
              <CommandItem
                key={tz}
                value={`${tz} ${tz.replace(/_/g, " ")} ${offset}`}
                data-checked={tz === value}
                onSelect={() => {
                  onChange(tz)
                  setOpen(false)
                }}
              >
                <span className="truncate">{tz.replace(/_/g, " ")}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{offset}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
