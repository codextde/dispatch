"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Free-form tag input (e.g. allowed sign-up domains, invite emails). Commits
 * on Enter, comma, space, blur and paste; Backspace on empty removes the last tag.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  normalize = (v) => v.trim(),
  validate,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  normalize?: (v: string) => string
  /** Return an error message for invalid entries */
  validate?: (v: string) => string | null
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  function commit(raw: string) {
    const parts = raw
      .split(/[\s,;]+/)
      .map(normalize)
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) {
      const problem = validate?.(p)
      if (problem) {
        setError(problem)
        setDraft(p)
        onChange(next)
        return
      }
      if (!next.includes(p)) next.push(p)
    }
    setError(null)
    setDraft("")
    onChange(next)
  }

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          (error || ariaInvalid) && "border-destructive",
          className
        )}
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface pr-1 pl-2 font-mono text-[12px]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          aria-invalid={Boolean(error) || ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
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
            if (/[\s,;]/.test(text)) {
              e.preventDefault()
              commit(draft + text)
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

export const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
