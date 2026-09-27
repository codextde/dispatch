"use client"

import { TriangleAlert } from "lucide-react"
import { CopyField } from "@/components/settings/copy-button"

/** "Copy it now, you won't see it again" panel for API keys and signing secrets. */
export function SecretReveal({ value, hint }: { value: string; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--warning),var(--foreground)_40%)]" />
        <p className="text-pretty">
          <span className="font-medium">Copy it now.</span> For your security it won&apos;t be shown again — if you lose it, create a
          new one.
        </p>
      </div>
      <CopyField value={value} secret />
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
