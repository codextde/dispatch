"use client"

import { CopyButton } from "@/components/settings/copy-button"
import { cn } from "@/lib/utils"

/** Monospace snippet with a copy button (docs panels, payload viewers). */
export function CodeBlock({
  code,
  label,
  className,
  maxHeight,
  copy = true,
}: {
  code: string
  /** Small caption shown in the header bar (e.g. "bash", "Node.js") */
  label?: string
  className?: string
  maxHeight?: number
  copy?: boolean
}) {
  return (
    <div className={cn("group relative min-w-0 overflow-hidden rounded-lg border bg-surface/70", className)}>
      {label && (
        <div className="flex h-8 items-center justify-between border-b bg-surface px-3">
          <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</span>
          {copy && <CopyButton value={code} variant="ghost" size="icon-xs" />}
        </div>
      )}
      {!label && copy && (
        <div className="absolute top-1.5 right-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <CopyButton value={code} variant="outline" size="icon-xs" className="bg-background" />
        </div>
      )}
      <pre
        className="scrollbar-thin overflow-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

/** Pretty-print JSON for display (falls back to the raw value). */
export function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
