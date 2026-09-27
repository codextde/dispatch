"use client"

import { useId, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { UserAvatar } from "@/components/app/user-avatar"
import { useRecipientSearch } from "@/hooks/inbox/queries"
import { formatAddress, isEmail, parseAddresses } from "@/lib/inbox/format"
import type { Participant } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useInbox } from "../inbox-provider"

/**
 * Address token input with autocomplete (contacts, past participants and
 * teammates). Commas, semicolons, Enter, Tab and blur turn text into tokens;
 * pasting a list of addresses works too.
 */
export function RecipientInput({
  label,
  value,
  onChange,
  autoFocus,
  trailing,
}: {
  label: string
  value: Participant[]
  onChange: (value: Participant[]) => void
  autoFocus?: boolean
  trailing?: React.ReactNode
}) {
  const { slug, members } = useInbox()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const { data: remote = [] } = useRecipientSearch(slug, text)

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return []
    const taken = new Set(value.map((v) => v.email.toLowerCase()))
    const out = new Map<string, Participant & { internal?: boolean }>()
    for (const r of remote) if (!taken.has(r.email.toLowerCase())) out.set(r.email.toLowerCase(), { name: r.name, email: r.email })
    for (const m of members) {
      if (out.size >= 8) break
      if (taken.has(m.email.toLowerCase())) continue
      if ((m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) out.set(m.email.toLowerCase(), { name: m.name, email: m.email, internal: true })
    }
    return [...out.values()].slice(0, 8)
  }, [remote, members, text, value])

  const add = (list: Participant[]) => {
    if (!list.length) return
    const seen = new Set(value.map((v) => v.email.toLowerCase()))
    onChange([...value, ...list.filter((p) => !seen.has(p.email.toLowerCase()) && (seen.add(p.email.toLowerCase()), true))])
  }

  const commit = () => {
    const raw = text.trim()
    if (!raw) return true
    const parsed = parseAddresses(raw)
    if (parsed.length) {
      add(parsed)
      setText("")
      return true
    }
    return false
  }

  const open = focused && suggestions.length > 0

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          className="flex min-h-9 cursor-text items-start gap-2 border-b px-3 py-1.5"
          onClick={() => inputRef.current?.focus()}
        >
          <label htmlFor={id} className="mt-1 w-8 shrink-0 text-[13px] text-muted-foreground">
            {label}
          </label>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {value.map((p) => (
              <span
                key={p.email}
                title={formatAddress(p)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/60 py-0.5 pr-0.5 pl-1.5 text-[12.5px]",
                  !isEmail(p.email) && "border-destructive/50 bg-destructive/10 text-destructive"
                )}
              >
                <span className="truncate">{p.name || p.email}</span>
                <button
                  type="button"
                  className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={`Remove ${p.email}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(value.filter((v) => v.email !== p.email))
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              id={id}
              value={text}
              autoFocus={autoFocus}
              autoComplete="off"
              inputMode="email"
              aria-label={`${label} recipients`}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${id}-suggestions`}
              className="h-6 min-w-24 flex-1 bg-transparent text-[13px] outline-none"
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false)
                commit()
              }}
              onChange={(e) => {
                const v = e.target.value
                if (/[,;]\s*$/.test(v) || (/[\s,;]/.test(v.trim()) && parseAddresses(v).length > 1)) {
                  const parsed = parseAddresses(v)
                  if (parsed.length) {
                    add(parsed)
                    setText("")
                    return
                  }
                }
                setText(v)
                setActive(0)
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text")
                const parsed = parseAddresses(pasted)
                if (parsed.length > 1 || (parsed.length === 1 && !text)) {
                  e.preventDefault()
                  add(parsed)
                }
              }}
              onKeyDown={(e) => {
                if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                  e.preventDefault()
                  setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length)
                  return
                }
                if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
                  if (open && suggestions[active]) {
                    e.preventDefault()
                    add([suggestions[active]!])
                    setText("")
                    return
                  }
                  if (text.trim()) {
                    if (commit()) e.preventDefault()
                  }
                  return
                }
                if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
                if (e.key === "Escape" && open) {
                  e.preventDefault()
                  e.stopPropagation()
                  setText("")
                }
              }}
            />
          </div>
          {trailing}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div role="listbox" id={`${id}-suggestions`} aria-label="Suggestions">
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                add([s])
                setText("")
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left", i === active && "bg-muted")}
            >
              <UserAvatar name={s.name} email={s.email} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{s.name || s.email}</span>
                {s.name && <span className="block truncate text-xs text-muted-foreground">{s.email}</span>}
              </span>
              {"internal" in s && s.internal ? <span className="font-mono text-[10px] text-muted-foreground uppercase">Team</span> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
