"use client"

import { useState } from "react"
import { Eye, EyeOff, KeyRound, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Input for a stored secret. The current value is never sent to the client —
 * only a masked preview (`redactSecrets`). Emits:
 *  - `undefined` → keep the stored value (default)
 *  - a string   → replace with this value
 *  - `""`       → remove the stored value (only when `allowClear`)
 */
export function SecretInput({
  id,
  preview,
  value,
  onChange,
  placeholder = "Paste the new value",
  allowClear = true,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  preview: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  allowClear?: boolean
  disabled?: boolean
  className?: string
  "aria-invalid"?: boolean
}) {
  const [editing, setEditing] = useState(!preview)
  const [draft, setDraft] = useState("")
  const [visible, setVisible] = useState(false)

  if (preview && !editing) {
    const clearing = value === ""
    return (
      <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <div
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-surface px-2.5 text-sm",
            clearing && "border-dashed text-muted-foreground line-through"
          )}
        >
          <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[12.5px]">{preview}</span>
          {!clearing && <span className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground sm:inline">stored encrypted</span>}
        </div>
        {clearing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)} disabled={disabled}>
            <Undo2 /> Undo
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} disabled={disabled}>
              Replace
            </Button>
            {allowClear && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} disabled={disabled}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className="pr-9 font-mono text-[13px]"
          onChange={(e) => {
            setDraft(e.target.value)
            onChange(e.target.value === "" ? undefined : e.target.value)
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Hide value" : "Show value"}
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {preview && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setEditing(false)
            setDraft("")
            onChange(undefined)
          }}
        >
          Cancel
        </Button>
      )}
    </div>
  )
}
