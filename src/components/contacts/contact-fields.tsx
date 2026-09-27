"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Inline-editable field: looks like text, becomes an input on focus and
 * commits on blur / Enter (Escape reverts). Used in the contact panel.
 */
export function InlineField({
  label,
  value,
  onCommit,
  placeholder,
  readOnly,
  type = "text",
  multiline,
  icon,
  className,
}: {
  label: string
  value: string | null | undefined
  onCommit: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  type?: "text" | "email" | "tel"
  multiline?: boolean
  icon?: React.ReactNode
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const current = draft ?? value ?? ""
  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next !== (value ?? "").trim()) onCommit(next)
  }
  const shared = {
    "aria-label": label,
    value: current,
    readOnly,
    placeholder: readOnly ? "—" : placeholder,
    onFocus: () => !readOnly && setDraft(value ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    className: cn(
      "w-full min-w-0 rounded-md bg-transparent px-2 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/70",
      !readOnly && "hover:bg-accent/70 focus:bg-background focus:ring-2 focus:ring-ring/40 dark:focus:bg-input/30",
      readOnly && "cursor-default"
    ),
  }
  return (
    <label className={cn("grid grid-cols-[88px_1fr] items-start gap-2", className)}>
      <span className="flex min-h-8 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {icon}
        {label}
      </span>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(null)
              e.currentTarget.blur()
            }
          }}
          className={cn(shared.className, "field-sizing-content min-h-16 resize-none leading-relaxed")}
        />
      ) : (
        <input
          {...shared}
          type={type}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setDraft(null)
              requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
            }
          }}
        />
      )}
    </label>
  )
}

/** Chip input for tags: Enter or comma adds, Backspace on empty removes the last tag. */
export function TagInput({
  value,
  onChange,
  readOnly,
  suggestions = [],
  placeholder = "Add tag",
}: {
  value: string[]
  onChange: (tags: string[]) => void
  readOnly?: boolean
  suggestions?: string[]
  placeholder?: string
}) {
  const [draft, setDraft] = useState("")
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, "-")
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return setDraft("")
    onChange([...value, t])
    setDraft("")
  }
  const listId = "contact-tag-suggestions"
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md px-1 py-1">
      {value.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium">
          {t}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="-mr-1 rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove tag ${t}`}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <>
          <input
            value={draft}
            list={suggestions.length ? listId : undefined}
            onChange={(e) => {
              const v = e.target.value
              if (v.endsWith(",")) add(v.slice(0, -1))
              else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add(draft)
              } else if (e.key === "Backspace" && !draft && value.length) {
                onChange(value.slice(0, -1))
              }
            }}
            onBlur={() => draft && add(draft)}
            placeholder={value.length ? "" : placeholder}
            aria-label="Add tag"
            className="h-6 min-w-20 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/70"
          />
          {suggestions.length > 0 && (
            <datalist id={listId}>
              {suggestions
                .filter((s) => !value.includes(s))
                .map((s) => (
                  <option key={s} value={s} />
                ))}
            </datalist>
          )}
        </>
      )}
      {readOnly && value.length === 0 && <span className="px-1 text-[13px] text-muted-foreground">—</span>}
    </div>
  )
}

/** Key/value editor for custom fields. Commits the whole map when a row changes. */
export function CustomFieldsEditor({
  value,
  onChange,
  readOnly,
}: {
  value: Record<string, string>
  onChange: (fields: Record<string, string>) => void
  readOnly?: boolean
}) {
  const entries = Object.entries(value)
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")
  const commitNew = () => {
    const k = newKey.trim()
    const v = newValue.trim()
    if (!k || !v) return
    onChange({ ...value, [k]: v })
    setNewKey("")
    setNewValue("")
  }
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="group/cf grid grid-cols-[88px_1fr_auto] items-center gap-2">
          <span className="truncate text-[12.5px] text-muted-foreground" title={k}>
            {k}
          </span>
          <input
            key={v}
            defaultValue={v}
            readOnly={readOnly}
            aria-label={k}
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next === v) return
              const copy = { ...value }
              if (next) copy[k] = next
              else delete copy[k]
              onChange(copy)
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className={cn(
              "w-full min-w-0 rounded-md bg-transparent px-2 py-1.5 text-[13px] outline-none",
              !readOnly && "hover:bg-accent/70 focus:bg-background focus:ring-2 focus:ring-ring/40 dark:focus:bg-input/30"
            )}
          />
          {!readOnly ? (
            <button
              type="button"
              onClick={() => {
                const copy = { ...value }
                delete copy[k]
                onChange(copy)
              }}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover/cf:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${k}`}
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Field"
            aria-label="New custom field name"
            className="w-full min-w-0 rounded-md bg-transparent px-0 py-1.5 text-[12.5px] outline-none placeholder:text-muted-foreground/60 focus:text-foreground"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitNew()}
            onBlur={commitNew}
            placeholder="Value"
            aria-label="New custom field value"
            className="w-full min-w-0 rounded-md bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/60 hover:bg-accent/70 focus:bg-background focus:ring-2 focus:ring-ring/40 dark:focus:bg-input/30"
          />
          <button
            type="button"
            onClick={commitNew}
            disabled={!newKey.trim() || !newValue.trim()}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            aria-label="Add custom field"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
