"use client"

import { Panel, StatusBadge, type Tone } from "@/components/admin/ui"
import { EmailDeliveryFields, TestEmailPanel, type EmailDeliveryValue } from "@/components/admin/email-delivery-fields"
import { SettingsFormShell, useSettingsForm } from "@/components/admin/settings/form"
import { useI18n } from "@/lib/i18n"

export type EmailSettingsValue = EmailDeliveryValue & { passwordEnc: string }

export function EmailSettingsForm({
  initial,
  status,
  adminEmail,
  defaultFromEmail,
}: {
  initial: EmailSettingsValue
  status: { tone: Tone; label: string }
  adminEmail: string
  defaultFromEmail: string
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const form = useSettingsForm("email", initial)
  const { passwordEnc: _preview, ...config } = form.values
  void _preview
  const password = form.secrets.passwordEnc
  return (
    <SettingsFormShell form={form}>
      <Panel
        title={it ? "Provider di invio" : "Delivery provider"}
        description={it ? "Le email di sistema — link di accesso, inviti e notifiche — vengono inviate tramite questo provider." : "System emails — sign-in links, invitations and notifications — are sent through this provider."}
        actions={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      >
        <EmailDeliveryFields
          key={form.formKey}
          value={config}
          onChange={(patch) => form.set(patch)}
          passwordPreview={form.secretPreview("passwordEnc")}
          password={password}
          onPasswordChange={(v) => form.setSecret("passwordEnc", v)}
          defaultFromEmail={defaultFromEmail}
          fieldErrors={form.errors}
        />
      </Panel>

      <Panel
        title={it ? "Prova invio" : "Test delivery"}
        description={it ? "Invia un messaggio di prova con le impostazioni sopra, incluse le modifiche non salvate, così puoi verificarle prima di salvare." : "Sends a test message with the settings above — including unsaved changes — so you can verify them before saving."}
      >
        <TestEmailPanel config={config} password={password} defaultTo={adminEmail} />
      </Panel>
    </SettingsFormShell>
  )
}
