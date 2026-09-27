"use client"

import { Eye, EyeOff, ImageIcon } from "lucide-react"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { NumberInput, SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"

export type SecuritySettingsValue = {
  blockPrivateNetworks: boolean
  loginRateLimitPerHour: number
  maxSessionsPerUser: number
  remoteImages: "always" | "ask" | "never"
}

export function SecuritySettingsForm({ initial, mode }: { initial: SecuritySettingsValue; mode: "private" | "saas" }) {
  const form = useSettingsForm("security", initial)
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title="Network" description="Protect the server from being used to reach internal systems.">
        <SwitchField
          id="blockPrivateNetworks"
          label="Block private networks"
          description={
            <>
              Refuse IMAP, SMTP and webhook connections to private, loopback and link-local addresses (SSRF protection).{" "}
              {mode === "saas"
                ? "Strongly recommended for public SaaS instances."
                : "Recommended unless your team connects to mail servers on your internal network."}
            </>
          }
          checked={v.blockPrivateNetworks}
          onCheckedChange={(blockPrivateNetworks) => form.set({ blockPrivateNetworks })}
        />
      </Panel>

      <Panel title="Sign-in protection">
        <div className="divide-y divide-border">
          <SettingField
            label="Sign-in emails per address"
            htmlFor="loginRateLimitPerHour"
            description="Maximum sign-in links/codes one email address can request per hour. Additional per-IP limits always apply."
            error={form.error("loginRateLimitPerHour")}
          >
            <NumberInput
              id="loginRateLimitPerHour"
              value={v.loginRateLimitPerHour}
              min={1}
              max={1000}
              suffix="per hour"
              onChange={(loginRateLimitPerHour) => form.set({ loginRateLimitPerHour })}
              aria-invalid={Boolean(form.error("loginRateLimitPerHour"))}
            />
          </SettingField>
          <SettingField
            label="Devices per user"
            htmlFor="maxSessionsPerUser"
            description="How many devices one person can be signed in on at once. When exceeded, the least recently used session is signed out."
            error={form.error("maxSessionsPerUser")}
          >
            <NumberInput
              id="maxSessionsPerUser"
              value={v.maxSessionsPerUser}
              min={1}
              max={1000}
              suffix="sessions"
              onChange={(maxSessionsPerUser) => form.set({ maxSessionsPerUser })}
              aria-invalid={Boolean(form.error("maxSessionsPerUser"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel
        title="Remote images"
        description="Images loaded from the sender's server can reveal when and where an email was opened. This is the default; people can change it for themselves."
      >
        <ChoiceCards
          aria-label="Remote images"
          columns={3}
          value={v.remoteImages}
          onChange={(remoteImages) => form.set({ remoteImages })}
          options={[
            { value: "ask", title: "Ask", description: "Block until someone chooses to load them.", icon: ImageIcon, badge: "Default" },
            { value: "always", title: "Always load", description: "Most convenient; senders can track opens.", icon: Eye },
            { value: "never", title: "Never load", description: "Maximum privacy; images stay hidden.", icon: EyeOff },
          ]}
        />
      </Panel>
    </SettingsFormShell>
  )
}
