"use client"

import { Eye, EyeOff, ImageIcon } from "lucide-react"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { NumberInput, SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"
import { useI18n } from "@/lib/i18n"

export type SecuritySettingsValue = {
  blockPrivateNetworks: boolean
  loginRateLimitPerHour: number
  maxSessionsPerUser: number
  remoteImages: "always" | "ask" | "never"
}

export function SecuritySettingsForm({ initial, mode }: { initial: SecuritySettingsValue; mode: "private" | "saas" }) {
  const form = useSettingsForm("security", initial)
  const { t } = useI18n()
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title={t("secNetwork")} description={t("secNetworkDesc")}>
        <SwitchField
          id="blockPrivateNetworks"
          label={t("secBlockPrivate")}
          description={
            <>
              {t("secBlockPrivateDesc")} {" "}
              {mode === "saas"
                ? t("secSaasAlways")
                : t("secPrivateRecommended")}
            </>
          }
          // Enforced by the mail engine in SaaS mode regardless of the stored value (src/server/mail/net-guard.ts)
          checked={mode === "saas" || v.blockPrivateNetworks}
          disabled={mode === "saas"}
          onCheckedChange={(blockPrivateNetworks) => form.set({ blockPrivateNetworks })}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          {t("secPlainTextWarning")}
        </p>
      </Panel>

      <Panel title={t("secSignInProtection")}>
        <div className="divide-y divide-border">
          <SettingField
            label={t("secEmailsPerAddress")}
            htmlFor="loginRateLimitPerHour"
            description={t("secEmailsPerAddressDesc")}
            error={form.error("loginRateLimitPerHour")}
          >
            <NumberInput
              id="loginRateLimitPerHour"
              value={v.loginRateLimitPerHour}
              min={1}
              max={1000}
              suffix={t("secPerHour")}
              onChange={(loginRateLimitPerHour) => form.set({ loginRateLimitPerHour })}
              aria-invalid={Boolean(form.error("loginRateLimitPerHour"))}
            />
          </SettingField>
          <SettingField
            label={t("secDevicesPerUser")}
            htmlFor="maxSessionsPerUser"
            description={t("secDevicesPerUserDesc")}
            error={form.error("maxSessionsPerUser")}
          >
            <NumberInput
              id="maxSessionsPerUser"
              value={v.maxSessionsPerUser}
              min={1}
              max={1000}
              suffix={t("secSessions")}
              onChange={(maxSessionsPerUser) => form.set({ maxSessionsPerUser })}
              aria-invalid={Boolean(form.error("maxSessionsPerUser"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel
        title={t("secRemoteImages")}
        description={t("secRemoteImagesDesc")}
      >
        <ChoiceCards
          aria-label={t("secRemoteImagesAria")}
          columns={3}
          value={v.remoteImages}
          onChange={(remoteImages) => form.set({ remoteImages })}
          options={[
            { value: "ask", title: t("secAsk"), description: t("secAskDesc"), icon: ImageIcon, badge: t("secDefault") },
            { value: "always", title: t("secAlwaysLoad"), description: t("secAlwaysLoadDesc"), icon: Eye },
            { value: "never", title: t("secNeverLoad"), description: t("secNeverLoadDesc"), icon: EyeOff },
          ]}
        />
      </Panel>
    </SettingsFormShell>
  )
}
