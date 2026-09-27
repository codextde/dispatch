"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim())
}

/**
 * Email chip input: type an address and press Enter, comma or space. Pasting a
 * list adds every valid address. Invalid input stays in the box with a hint.
 */
export function EmailChips({
  id,
  value,
  onChange,
  placeholder = "name@example.com",
  max = 50,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  max?: number
  "aria-invalid"?: boolean
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const commit = (raw: string) => {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
    if (!parts.length) return true
    const invalid = parts.filter((p) => !isEmail(p))
    const next = [...value]
    for (const p of parts) if (isEmail(p) && !next.includes(p) && next.length < max) next.push(p)
    if (next.length !== value.length) onChange(next)
    if (invalid.length) {
      setDraft(invalid.join(" "))
      setError(`"${invalid[0]}" isn't a valid email address`)
      return false
    }
    setDraft("")
    setError(null)
    return true
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        aria-invalid={ariaInvalid || Boolean(error)}
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        )}
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-surface pr-0.5 pl-1.5 font-mono text-[12px]">
            <span className="truncate">{v}</span>
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === ";") {
              if (draft.trim()) {
                e.preventDefault()
                commit(draft)
              } else if (e.key === "Enter") {
                e.preventDefault()
              }
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (/[\s,;]/.test(text)) {
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
