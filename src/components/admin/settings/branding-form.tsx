"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LogoMark } from "@/components/brand/logo"
import { Panel } from "@/components/admin/ui"
import { SettingField, SettingsFormShell, useSettingsForm } from "@/components/admin/settings/form"
import { useI18n } from "@/lib/i18n"

export type BrandingSettingsValue = {
  productName: string
  logoUrl: string
  accentColor: string
  supportUrl: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Black or white text, whichever reads better on the given hex background. */
function readableText(hex: string | undefined) {
  if (!hex) return "#0b0b0b"
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.35 ? "#0b0b0b" : "#ffffff"
}

function LogoPreview({ url, name }: { url: string; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(url) && failedUrl !== url
  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided URL
        <img src={url} alt="" className="size-7 shrink-0 rounded-md object-contain" onError={() => setFailedUrl(url)} />
      ) : (
        <LogoMark className="size-7" title={name} />
      )}
      <span className="truncate text-[15px] leading-none">{name || "Dispatch"}</span>
    </span>
  )
}

export function BrandingSettingsForm({ initial }: { initial: BrandingSettingsValue }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const form = useSettingsForm("branding", initial)
  const v = form.values
  const accent = HEX.test(v.accentColor) ? v.accentColor : undefined
  return (
    <SettingsFormShell form={form}>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Panel title={it ? "Identità" : "Identity"} description={it ? "Personalizza Dispatch per la tua azienda o il servizio che ospiti." : "Rebrand Dispatch for your company or hosted service."}>
          <div className="divide-y divide-border">
            <SettingField
              label={it ? "Nome del prodotto" : "Product name"}
              htmlFor="productName"
              description={it ? "Sostituisce “Dispatch” nell’app, nella pagina di accesso e nelle email di sistema." : "Replaces “Dispatch” in the app, sign-in page and system emails."}
              error={form.error("productName")}
            >
              <Input
                id="productName"
                value={v.productName}
                maxLength={60}
                onChange={(e) => form.set({ productName: e.target.value })}
                aria-invalid={Boolean(form.error("productName"))}
                className="sm:max-w-md"
              />
            </SettingField>
            <SettingField
              label="URL del logo"
              htmlFor="logoUrl"
              description={it ? "Immagine quadrata (SVG o PNG, almeno 64×64). URL HTTPS o percorso come /logo.svg. Lascia vuoto per usare il logo predefinito." : "A square image (SVG or PNG, at least 64×64). HTTPS URL or a path such as /logo.svg. Leave empty for the default mark."}
              error={form.error("logoUrl")}
            >
              <Input
                id="logoUrl"
                value={v.logoUrl}
                placeholder="https://example.com/logo.svg"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => form.set({ logoUrl: e.target.value })}
                aria-invalid={Boolean(form.error("logoUrl"))}
              />
            </SettingField>
            <SettingField
              label={it ? "Colore principale" : "Accent color"}
              htmlFor="accentColor"
              description={it ? "Colore esadecimale usato per gli elementi in evidenza. Lascia vuoto per mantenere il verde predefinito." : "Hex color used for highlights. Leave empty for signal green."}
              error={form.error("accentColor")}
            >
              <div className="flex items-center gap-2">
                <label
                  className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-input"
                  style={{ backgroundColor: accent ?? "var(--brand)" }}
                >
                  <span className="sr-only">{it ? "Scegli il colore principale" : "Pick accent color"}</span>
                  <input
                    type="color"
                    value={accent ?? "#22c55e"}
                    onChange={(e) => form.set({ accentColor: e.target.value })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
                <Input
                  id="accentColor"
                  value={v.accentColor}
                  placeholder="#22c55e"
                  maxLength={7}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-32 font-mono text-[13px]"
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    form.set({ accentColor: raw && !raw.startsWith("#") ? `#${raw}` : raw })
                  }}
                  aria-invalid={Boolean(form.error("accentColor"))}
                />
                {v.accentColor && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={it ? "Reimposta il colore" : "Reset accent color"} onClick={() => form.set({ accentColor: "" })}>
                    <X />
                  </Button>
                )}
              </div>
            </SettingField>
            <SettingField
              label={it ? "URL dell’assistenza" : "Support URL"}
              htmlFor="supportUrl"
              description={it ? "Dove ricevere assistenza: URL del centro supporto o link mailto:." : "Where people can get help — a help center URL or a mailto: link."}
              error={form.error("supportUrl")}
            >
              <Input
                id="supportUrl"
                value={v.supportUrl}
                placeholder="https://help.example.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => form.set({ supportUrl: e.target.value })}
                aria-invalid={Boolean(form.error("supportUrl"))}
              />
            </SettingField>
          </div>
        </Panel>

        <div className="lg:sticky lg:top-20">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{it ? "Anteprima" : "Preview"}</div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex h-11 items-center border-b border-border bg-sidebar px-3">
              <LogoPreview url={v.logoUrl.trim()} name={v.productName.trim()} />
            </div>
            <div className="grid gap-3 p-4">
              <div className="text-sm font-semibold tracking-tight">
                {it ? "Accedi a " : "Sign in to "}{v.productName.trim() || "Dispatch"} <span className="text-quiet">{it ? "con la tua email" : "with your email"}</span>
              </div>
              <div className="h-8 rounded-lg border border-input bg-background" />
              <div
                className="flex h-8 items-center justify-center rounded-lg text-[13px] font-medium"
                style={{ backgroundColor: accent ?? "var(--brand)", color: readableText(accent) }}
              >
                {it ? "Continua con l’email" : "Continue with email"}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: accent ?? "var(--brand)" }} />
                {it ? "3 nuove conversazioni" : "3 new conversations"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsFormShell>
  )
}
