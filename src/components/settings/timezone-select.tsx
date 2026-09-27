"use client"

import { useMemo } from "react"
import { Combobox } from "@/components/settings/combobox"

function offsetLabel(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date())
    return parts.find((p) => p.type === "timeZoneName")?.value?.replace("GMT", "UTC") ?? ""
  } catch {
    return ""
  }
}

export function listTimezones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone")
    return zones.includes("UTC") ? zones : ["UTC", ...zones]
  } catch {
    return ["UTC"]
  }
}

export function TimezoneSelect({
  value,
  onChange,
  id,
  placeholder = "Select timezone",
  allowEmpty,
  emptyLabel = "Use workspace default",
  className = "sm:w-72",
}: {
  value: string | null | undefined
  onChange: (tz: string | null) => void
  id?: string
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
}) {
  const options = useMemo(() => {
    const zones = listTimezones()
    if (value && !zones.includes(value)) zones.unshift(value)
    const opts = zones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " "), hint: offsetLabel(tz) }))
    return allowEmpty ? [{ value: "__none__", label: emptyLabel }, ...opts] : opts
  }, [value, allowEmpty, emptyLabel])

  return (
    <Combobox
      id={id}
      options={options}
      value={value ?? (allowEmpty ? "__none__" : null)}
      onChange={(v) => onChange(!v || v === "__none__" ? null : v)}
      placeholder={placeholder}
      searchPlaceholder="Search city or region…"
      className={className}
    />
  )
}
