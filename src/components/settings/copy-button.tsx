"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export async function copyToClipboard(value: string, message = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(message)
    return true
  } catch {
    toast.error("Couldn't access the clipboard — copy it manually.")
    return false
  }
}

export function CopyButton({
  value,
  label,
  message,
  className,
  variant = "outline",
  size,
}: {
  value: string
  /** Visible label; icon-only when omitted */
  label?: string
  message?: string
  className?: string
  variant?: "outline" | "ghost" | "secondary" | "default"
  size?: "sm" | "default" | "xs" | "icon" | "icon-sm" | "icon-xs"
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (label ? "sm" : "icon-sm")}
      className={cn("shrink-0", className)}
      aria-label={label ? undefined : "Copy"}
      onClick={async () => {
        if (await copyToClipboard(value, message)) setCopied(true)
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {label}
    </Button>
  )
}

/** Read-only monospace value with a copy button (tokens, URLs, secrets shown once). */
export function CopyField({ value, className, secret }: { value: string; className?: string; secret?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-lg border bg-surface p-1 pl-3", className)}>
      <code
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[12.5px] select-all",
          secret && "text-foreground"
        )}
        title={value}
      >
        {value}
      </code>
      <CopyButton value={value} variant="ghost" />
    </div>
  )
}
