"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function normalizeDomain(raw: string) {
  return raw.trim().toLowerCase().replace(/^@/, "").replace(/^.*@/, "")
}

/** Chip input for email domains: type and press Enter, comma or space; paste lists. */
export function DomainChips({
  id,
  value,
  onChange,
  placeholder = "acme.com",
  flagged = [],
}: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  /** Domains to highlight (e.g. public email providers) */
  flagged?: string[]
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean)
    if (!parts.length) return
    const invalid = parts.filter((p) => !DOMAIN_RE.test(p))
    const next = [...value]
    for (const p of parts) if (DOMAIN_RE.test(p) && !next.includes(p)) next.push(p)
    onChange(next.slice(0, 20))
    setDraft(invalid.join(" "))
    setError(invalid.length ? `Not a valid domain: ${invalid.join(", ")}` : null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          error && "border-destructive"
        )}
      >
        {value.map((d) => (
          <span
            key={d}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border bg-surface pr-1 pl-2 font-mono text-xs",
              flagged.includes(d) && "border-warning/50 bg-warning/10"
            )}
          >
            @{d}
            <button
              type="button"
              aria-label={`Remove ${d}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onChange(value.filter((x) => x !== d))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          aria-invalid={Boolean(error)}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setError(null)
            const v = e.target.value
            if (/[\s,;]$/.test(v)) commit(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit(draft)
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault()
              commit(`${draft} ${text}`)
            }
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
