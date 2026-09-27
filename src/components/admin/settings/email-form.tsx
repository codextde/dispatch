"use client"

import { Panel, StatusBadge, type Tone } from "@/components/admin/ui"
import { EmailDeliveryFields, TestEmailPanel, type EmailDeliveryValue } from "@/components/admin/email-delivery-fields"
import { SettingsFormShell, useSettingsForm } from "@/components/admin/settings/form"

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
  const form = useSettingsForm("email", initial)
  const { passwordEnc: _preview, ...config } = form.values
  void _preview
  const password = form.secrets.passwordEnc
  return (
    <SettingsFormShell form={form}>
      <Panel
        title="Delivery provider"
        description="System emails — sign-in links, invitations and notifications — are sent through this provider."
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
        title="Test delivery"
        description="Sends a test message with the settings above — including unsaved changes — so you can verify them before saving."
      >
        <TestEmailPanel config={config} password={password} defaultTo={adminEmail} />
      </Panel>
    </SettingsFormShell>
  )
}
