"use client"

import Link from "next/link"
import { AtSign, BadgeCheck, Globe2, Lock, ShieldCheck, TriangleAlert, Users } from "lucide-react"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { DOMAIN_RE, TagInput } from "@/components/admin/tag-input"
import { Callout, NumberInput, SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"

export type AuthSettingsValue = {
  signupMode: "open" | "invite_only" | "domains"
  allowedSignupDomains: string[]
  workspaceCreation: "anyone" | "super_admins"
  sessionDays: number
  magicLinkMinutes: number
  googleLogin: boolean
  microsoftLogin: boolean
  verifiedAutoJoinDomains: string[]
}

export function AuthSettingsForm({
  initial,
  oauthReady,
  mode,
}: {
  initial: AuthSettingsValue
  oauthReady: { google: boolean; microsoft: boolean }
  mode: "private" | "saas"
}) {
  const form = useSettingsForm("auth", initial)
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title="Who can sign up" description="Existing users and anyone with a pending invitation can always sign in.">
        <ChoiceCards
          aria-label="Sign-up policy"
          columns={3}
          value={v.signupMode}
          onChange={(signupMode) => form.set({ signupMode })}
          options={[
            { value: "invite_only", title: "Invite only", description: "Only people invited to a workspace can create an account.", icon: Lock },
            { value: "domains", title: "Allowed domains", description: "Anyone with an email address at an approved domain.", icon: AtSign },
            { value: "open", title: "Open sign-up", description: "Anyone can create an account with their email.", icon: Globe2 },
          ]}
        />
        {v.signupMode === "domains" && (
          <div className="mt-4">
            <SettingField
              label="Allowed domains"
              htmlFor="allowedSignupDomains"
              description="Press Enter or comma after each domain. Subdomains must be listed separately."
              error={form.error("allowedSignupDomains")}
            >
              <TagInput
                id="allowedSignupDomains"
                value={v.allowedSignupDomains}
                onChange={(allowedSignupDomains) => form.set({ allowedSignupDomains })}
                placeholder="acme.com, acme.co.uk"
                normalize={(d) => d.trim().toLowerCase().replace(/^@/, "")}
                validate={(d) => (DOMAIN_RE.test(d) ? null : `“${d}” is not a valid domain`)}
                aria-invalid={Boolean(form.error("allowedSignupDomains"))}
              />
            </SettingField>
          </div>
        )}
        {v.signupMode === "open" && mode === "private" && (
          <Callout tone="warn" icon={TriangleAlert} className="mt-4">
            This instance is in <strong>private</strong> mode but sign-up is open: anyone who finds the URL can create an account
            {v.workspaceCreation === "anyone" ? " and a workspace" : ""}.
          </Callout>
        )}
      </Panel>

      <Panel title="Workspace creation" description="Who may create additional workspaces on this instance.">
        <ChoiceCards
          aria-label="Workspace creation"
          value={v.workspaceCreation}
          onChange={(workspaceCreation) => form.set({ workspaceCreation })}
          options={[
            { value: "anyone", title: "Anyone who can sign in", description: "Every user can create their own workspaces.", icon: Users },
            {
              value: "super_admins",
              title: "Instance admins only",
              description: "Other users see a note to ask for an invitation.",
              icon: ShieldCheck,
            },
          ]}
        />
      </Panel>

      <Panel
        title="Auto-join domains"
        description="Workspaces can let people with a company email address join automatically. Only brand-new accounts are joined; existing users get an invitation screen instead."
      >
        <SettingField
          label="Approved domains"
          htmlFor="verifiedAutoJoinDomains"
          description={
            mode === "saas"
              ? "In SaaS mode a workspace can only auto-admit members from domains you approve here. Approve a domain only after confirming the workspace owns it (for example through a DNS TXT record)."
              : "Only enforced in SaaS mode. In private mode, workspace admins can turn on auto-join for their own email domain."
          }
          error={form.error("verifiedAutoJoinDomains")}
        >
          <TagInput
            id="verifiedAutoJoinDomains"
            value={v.verifiedAutoJoinDomains}
            onChange={(verifiedAutoJoinDomains) => form.set({ verifiedAutoJoinDomains })}
            placeholder="acme.com"
            normalize={(d) => d.trim().toLowerCase().replace(/^@/, "")}
            validate={(d) => (DOMAIN_RE.test(d) ? null : `“${d}” is not a valid domain`)}
            aria-invalid={Boolean(form.error("verifiedAutoJoinDomains"))}
          />
        </SettingField>
        {mode === "saas" && v.verifiedAutoJoinDomains.length === 0 && (
          <Callout icon={BadgeCheck} className="mt-4">
            No domains approved: auto-join is off for every workspace. Public email providers can never be approved.
          </Callout>
        )}
      </Panel>

      <Panel title="Sessions & magic links" description="Dispatch is passwordless: people sign in with a one-time link or 6-digit code.">
        <div className="divide-y divide-border">
          <SettingField
            label="Session lifetime"
            htmlFor="sessionDays"
            description="How long a device stays signed in. Sessions slide — they're extended while in use. Default: 365 days."
            error={form.error("sessionDays")}
          >
            <NumberInput
              id="sessionDays"
              value={v.sessionDays}
              min={1}
              max={3650}
              suffix="days"
              onChange={(sessionDays) => form.set({ sessionDays })}
              aria-invalid={Boolean(form.error("sessionDays"))}
            />
          </SettingField>
          <SettingField
            label="Sign-in link validity"
            htmlFor="magicLinkMinutes"
            description="Links and codes expire after this many minutes (5–120) and work only once."
            error={form.error("magicLinkMinutes")}
          >
            <NumberInput
              id="magicLinkMinutes"
              value={v.magicLinkMinutes}
              min={5}
              max={120}
              suffix="minutes"
              onChange={(magicLinkMinutes) => form.set({ magicLinkMinutes })}
              aria-invalid={Boolean(form.error("magicLinkMinutes"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel
        title="Social sign-in"
        description="Offer “Continue with Google / Microsoft” on the sign-in page, in addition to email links."
      >
        <div className="divide-y divide-border">
          <SwitchField
            id="googleLogin"
            label="Sign in with Google"
            description={
              oauthReady.google ? (
                "Uses the Google OAuth app configured for this instance."
              ) : (
                <>
                  Configure and enable the Google app in{" "}
                  <Link href="/admin/settings/oauth" className="font-medium text-foreground underline underline-offset-2">
                    OAuth apps
                  </Link>{" "}
                  first.
                </>
              )
            }
            checked={v.googleLogin}
            disabled={!oauthReady.google && !v.googleLogin}
            onCheckedChange={(googleLogin) => form.set({ googleLogin })}
          />
          <SwitchField
            id="microsoftLogin"
            label="Sign in with Microsoft"
            description={
              oauthReady.microsoft ? (
                "Uses the Microsoft Entra ID app configured for this instance."
              ) : (
                <>
                  Configure and enable the Microsoft app in{" "}
                  <Link href="/admin/settings/oauth" className="font-medium text-foreground underline underline-offset-2">
                    OAuth apps
                  </Link>{" "}
                  first.
                </>
              )
            }
            checked={v.microsoftLogin}
            disabled={!oauthReady.microsoft && !v.microsoftLogin}
            onCheckedChange={(microsoftLogin) => form.set({ microsoftLogin })}
          />
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
