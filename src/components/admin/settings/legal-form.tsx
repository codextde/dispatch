"use client"

import { ArrowUpRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/admin/ui"
import { SettingField, SettingsFormShell, useSettingsForm } from "@/components/admin/settings/form"
import { MarkdownEditor } from "@/components/admin/settings/markdown-editor"

export type LegalSettingsValue = {
  companyName: string
  imprint: string
  privacy: string
  terms: string
}

const DOCS = [
  {
    key: "imprint",
    title: "Imprint",
    slug: "imprint",
    description: "Legal notice / Impressum: company name, address, representatives, registration and contact details.",
    placeholder: "# Imprint\n\nAcme GmbH\nExample Street 1\n12345 Berlin\n\nRepresented by: …\nEmail: legal@acme.com",
  },
  {
    key: "privacy",
    title: "Privacy policy",
    slug: "privacy",
    description: "What personal data you process, why, for how long, sub-processors and people's rights.",
    placeholder: "# Privacy policy\n\n## Who we are\n…",
  },
  {
    key: "terms",
    title: "Terms of service",
    slug: "terms",
    description: "The agreement between you and the people using this instance.",
    placeholder: "# Terms of service\n\n## 1. Scope\n…",
  },
] as const

export function LegalSettingsForm({ initial }: { initial: LegalSettingsValue }) {
  const form = useSettingsForm("legal", initial)
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title="Operator" description="Shown in the website footer and on legal pages.">
        <SettingField label="Company name" htmlFor="companyName" error={form.error("companyName")}>
          <Input
            id="companyName"
            value={v.companyName}
            placeholder="Acme GmbH"
            onChange={(e) => form.set({ companyName: e.target.value })}
            className="sm:max-w-md"
          />
        </SettingField>
      </Panel>

      {DOCS.map((doc) => (
        <Panel
          key={doc.key}
          title={doc.title}
          description={
            <>
              {doc.description} Published at <code className="font-mono text-[12px]">/legal/{doc.slug}</code>.
            </>
          }
          actions={
            form.baseline[doc.key].trim() ? (
              <a
                href={`/legal/${doc.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                View page <ArrowUpRight className="size-3.5" />
              </a>
            ) : null
          }
        >
          <MarkdownEditor
            id={`legal-${doc.key}`}
            value={v[doc.key]}
            onChange={(text) => form.set({ [doc.key]: text } as Partial<LegalSettingsValue>)}
            placeholder={doc.placeholder}
            invalid={Boolean(form.error(doc.key))}
          />
          {form.error(doc.key) && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {form.error(doc.key)}
            </p>
          )}
        </Panel>
      ))}
    </SettingsFormShell>
  )
}
