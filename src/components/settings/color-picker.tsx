"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
] as const

export const HEX_RE = /^#([0-9a-f]{6})$/i

export function randomPresetColor() {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]!
}

/** Swatch grid + hex input. Used for labels, teams, roles and inboxes. */
export function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hex, setHex] = useState(value)
  const [synced, setSynced] = useState(value)
  // Follow external value changes (adjusting state during render, not in an effect)
  if (synced !== value) {
    setSynced(value)
    setHex(value)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Color">
        {PRESET_COLORS.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c}
              onClick={() => onChange(c)}
              className={cn(
                "flex size-6 items-center justify-center rounded-full ring-1 ring-black/10 transition-transform ring-inset hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none",
                selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-popover"
              )}
              style={{ backgroundColor: c }}
            >
              {selected && <Check className="size-3.5 text-white drop-shadow" />}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border" style={{ backgroundColor: value }}>
          <span className="sr-only">Custom color</span>
          <input
            type="color"
            value={HEX_RE.test(value) ? value : "#64748b"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          aria-label="Hex color"
          value={hex}
          spellCheck={false}
          maxLength={7}
          className="font-mono uppercase"
          onChange={(e) => {
            let v = e.target.value.trim()
            if (v && !v.startsWith("#")) v = `#${v}`
            setHex(v)
            if (HEX_RE.test(v)) onChange(v.toLowerCase())
          }}
          onBlur={() => setHex(value)}
        />
      </div>
    </div>
  )
}

/** Compact color button that opens the swatch popover. */
export function ColorPicker({
  value,
  onChange,
  className,
  label = "Pick a color",
}: {
  value: string
  onChange: (color: string) => void
  className?: string
  label?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30",
            className
          )}
        >
          <span className="size-4 rounded-full ring-1 ring-black/10 ring-inset" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <ColorSwatches value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
