"use client"

import { TriangleAlert } from "lucide-react"
import { CopyField } from "@/components/settings/copy-button"
import { useI18n } from "@/lib/i18n"

/** "Copy it now, you won't see it again" panel for API keys and signing secrets. */
export function SecretReveal({ value, hint }: { value: string; hint?: React.ReactNode }) {
  const { locale } = useI18n()
  const it = locale === "it"
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--warning),var(--foreground)_40%)]" />
        <p className="text-pretty">
          <span className="font-medium">{it ? "Copiala ora." : "Copy it now."}</span> {it ? "Per sicurezza non verrà mostrata di nuovo. Se la perdi, creane una nuova." : "For your security it won't be shown again — if you lose it, create a new one."}
        </p>
      </div>
      <CopyField value={value} secret />
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
