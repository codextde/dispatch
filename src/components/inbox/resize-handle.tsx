"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

/**
 * Vertical drag handle between panes. Controlled width in px; supports
 * pointer drag, arrow keys (±16px) and double-click to reset.
 */
export function ResizeHandle({
  value,
  onChange,
  min,
  max,
  defaultValue,
  label,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  defaultValue: number
  label: string
  className?: string
}) {
  const start = useRef<{ x: number; value: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className={cn(
        "group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors",
        "hover:after:bg-brand/60 focus-visible:after:bg-brand data-[dragging=true]:after:bg-brand",
        className
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.dataset.dragging = "true"
        start.current = { x: e.clientX, value }
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        onChange(clamp(start.current.value + e.clientX - start.current.x))
      }}
      onPointerUp={(e) => {
        start.current = null
        e.currentTarget.dataset.dragging = "false"
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(value - 16))
        else if (e.key === "ArrowRight") onChange(clamp(value + 16))
        else return
        e.preventDefault()
      }}
    />
  )
}
