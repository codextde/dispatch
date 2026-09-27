"use client"

import { Building2, Globe2, Megaphone } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"
import { TimezoneSelect } from "@/components/admin/settings/timezone-select"
import { cn } from "@/lib/utils"

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
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title="Instance" description="How this Dispatch instance identifies itself to people and in emails.">
        <div className="divide-y divide-border">
          <SettingField label="Instance name" htmlFor="instanceName" description="Shown in the admin panel, page titles and system emails." error={form.error("instanceName")}>
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
            label="Support email"
            htmlFor="supportEmail"
            description="Where users can reach you. Shown on error pages and in the footer of system emails."
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
            label="Default time zone"
            htmlFor="defaultTimezone"
            description="Used for new workspaces and users until they pick their own."
            error={form.error("defaultTimezone")}
          >
            <TimezoneSelect id="defaultTimezone" value={v.defaultTimezone} onChange={(defaultTimezone) => form.set({ defaultTimezone })} />
          </SettingField>
        </div>
      </Panel>

      <Panel title="Mode" description="Decide who this instance is for. You can change this at any time.">
        <ChoiceCards
          aria-label="Instance mode"
          value={v.mode}
          onChange={(mode) => form.set({ mode })}
          options={[
            {
              value: "private",
              title: "Private — just my company",
              description: "Self-hosted for your own team. Sign-up is by invitation; no billing.",
              icon: Building2,
            },
            {
              value: "saas",
              title: "Public SaaS — sign-ups & billing",
              description: "Let other teams sign up and create workspaces, optionally with paid Stripe subscriptions.",
              icon: Globe2,
            },
          ]}
        />
        <div className="mt-4 border-t border-border pt-4">
          <SwitchField
            id="marketingSite"
            label="Public website"
            description="Show the marketing website (home, features, pricing) at the root URL. When off, visitors go straight to sign-in."
            checked={v.marketingSite}
            onCheckedChange={(marketingSite) => form.set({ marketingSite })}
          />
        </div>
      </Panel>

      <Panel
        title="Announcement banner"
        description="A short message shown at the top of every workspace — for maintenance windows or news. Leave empty to hide it."
      >
        <SettingField label="Message" htmlFor="announcement" error={form.error("announcement")}>
          <Textarea
            id="announcement"
            value={v.announcement}
            maxLength={ANNOUNCEMENT_MAX}
            rows={3}
            placeholder="Scheduled maintenance on Sunday 02:00–03:00 UTC."
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
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Preview</div>
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
