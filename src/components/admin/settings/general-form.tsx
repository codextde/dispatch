"use client"

import { Building2, Globe2, Megaphone } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"
import { TimezoneSelect } from "@/components/admin/settings/timezone-select"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type GeneralSettingsValue = {
  instanceName: string
  mode: "private" | "saas"
  marketingSite: boolean
  supportEmail: string
  defaultTimezone: string
  announcement: string
}

const ANNOUNCEMENT_MAX = 500

export function GeneralSettingsForm({ initial }: { initial: GeneralSettingsValue }) {
  const form = useSettingsForm("general", initial)
  const { t } = useI18n()
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title={t("genInstance")} description={t("genInstanceDesc")}>
        <div className="divide-y divide-border">
          <SettingField label={t("genInstanceName")} htmlFor="instanceName" description={t("genInstanceNameDesc")} error={form.error("instanceName")}>
            <Input
              id="instanceName"
              value={v.instanceName}
              maxLength={80}
              onChange={(e) => form.set({ instanceName: e.target.value })}
              aria-invalid={Boolean(form.error("instanceName"))}
              className="sm:max-w-md"
            />
          </SettingField>
          <SettingField
            label={t("genSupportEmail")}
            htmlFor="supportEmail"
            description={t("genSupportEmailDesc")}
            error={form.error("supportEmail")}
          >
            <Input
              id="supportEmail"
              type="email"
              value={v.supportEmail}
              placeholder="support@example.com"
              onChange={(e) => form.set({ supportEmail: e.target.value })}
              aria-invalid={Boolean(form.error("supportEmail"))}
              className="sm:max-w-md"
            />
          </SettingField>
          <SettingField
            label={t("genTimezone")}
            htmlFor="defaultTimezone"
            description={t("genTimezoneDesc")}
            error={form.error("defaultTimezone")}
          >
            <TimezoneSelect id="defaultTimezone" value={v.defaultTimezone} onChange={(defaultTimezone) => form.set({ defaultTimezone })} />
          </SettingField>
        </div>
      </Panel>

      <Panel title={t("genMode")} description={t("genModeDesc")}>
        <ChoiceCards
          aria-label={t("genModeAria")}
          value={v.mode}
          onChange={(mode) => form.set({ mode })}
          options={[
            {
              value: "private",
              title: t("genPrivate"),
              description: t("genPrivateDesc"),
              icon: Building2,
            },
            {
              value: "saas",
              title: t("genSaas"),
              description: t("genSaasDesc"),
              icon: Globe2,
            },
          ]}
        />
        <div className="mt-4 border-t border-border pt-4">
          <SwitchField
            id="marketingSite"
            label={t("genPublicWebsite")}
            description={t("genPublicWebsiteDesc")}
            checked={v.marketingSite}
            onCheckedChange={(marketingSite) => form.set({ marketingSite })}
          />
        </div>
      </Panel>

      <Panel
        title={t("genAnnouncement")}
        description={t("genAnnouncementDesc")}
      >
        <SettingField label={t("genMessage")} htmlFor="announcement" error={form.error("announcement")}>
          <Textarea
            id="announcement"
            value={v.announcement}
            maxLength={ANNOUNCEMENT_MAX}
            rows={3}
            placeholder={t("genAnnouncementPlaceholder")}
            onChange={(e) => form.set({ announcement: e.target.value })}
            aria-invalid={Boolean(form.error("announcement"))}
          />
          <div className="mt-1.5 flex justify-end">
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums text-muted-foreground",
                v.announcement.length > ANNOUNCEMENT_MAX - 50 && "text-amber-600 dark:text-amber-400"
              )}
            >
              {v.announcement.length}/{ANNOUNCEMENT_MAX}
            </span>
          </div>
        </SettingField>
        {v.announcement.trim() && (
          <div className="mt-3">
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t("genPreview")}</div>
            <div className="flex items-center justify-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-4 py-2 text-center text-xs">
              <Megaphone className="size-3.5 shrink-0" />
              <span className="min-w-0 break-words">{v.announcement.trim()}</span>
            </div>
          </div>
        )}
      </Panel>
    </SettingsFormShell>
  )
}
