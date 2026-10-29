"use client"

import Link from "next/link"
import { AtSign, BadgeCheck, Globe2, Lock, ShieldCheck, TriangleAlert, Users } from "lucide-react"
import { Panel } from "@/components/admin/ui"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { DOMAIN_RE, TagInput } from "@/components/admin/tag-input"
import { Callout, NumberInput, SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"
import { useI18n } from "@/lib/i18n"

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
  const { t, locale } = useI18n()
  const v = form.values
  return (
    <SettingsFormShell form={form}>
      <Panel title={t("authWhoCanSignUp")} description={t("authSignUpExisting")}>
        <ChoiceCards
          aria-label={t("authSignUpPolicy")}
          columns={3}
          value={v.signupMode}
          onChange={(signupMode) => form.set({ signupMode })}
          options={[
            { value: "invite_only", title: t("authInviteOnly"), description: t("authInviteOnlyDesc"), icon: Lock },
            { value: "domains", title: t("authAllowedDomains"), description: t("authAllowedDomainsDesc"), icon: AtSign },
            { value: "open", title: t("authOpenSignUp"), description: t("authOpenSignUpDesc"), icon: Globe2 },
          ]}
        />
        {v.signupMode === "domains" && (
          <div className="mt-4">
            <SettingField
              label={t("authAllowedDomains")}
              htmlFor="allowedSignupDomains"
              description={t("authAllowedDomainsHelp")}
              error={form.error("allowedSignupDomains")}
            >
              <TagInput
                id="allowedSignupDomains"
                value={v.allowedSignupDomains}
                onChange={(allowedSignupDomains) => form.set({ allowedSignupDomains })}
                placeholder="acme.com, acme.co.uk"
                normalize={(d) => d.trim().toLowerCase().replace(/^@/, "")}
                validate={(d) => (DOMAIN_RE.test(d) ? null : t("authInvalidDomain").replace("{domain}", d))}
                aria-invalid={Boolean(form.error("allowedSignupDomains"))}
              />
            </SettingField>
          </div>
        )}
        {v.signupMode === "open" && mode === "private" && (
          <Callout tone="warn" icon={TriangleAlert} className="mt-4">
            {t("authPrivateOpenWarning").replace("{suffix}", v.workspaceCreation === "anyone" ? " and a workspace" : "")}
          </Callout>
        )}
      </Panel>

      <Panel title={t("authWorkspaceCreation")} description={t("authWorkspaceCreationDesc")}>
        <ChoiceCards
          aria-label={t("authWorkspaceCreationAria")}
          value={v.workspaceCreation}
          onChange={(workspaceCreation) => form.set({ workspaceCreation })}
          options={[
            { value: "anyone", title: t("authAnyoneSignIn"), description: t("authAnyoneSignInDesc"), icon: Users },
            {
              value: "super_admins",
              title: t("authAdminsOnly"),
              description: t("authAdminsOnlyDesc"),
              icon: ShieldCheck,
            },
          ]}
        />
      </Panel>

      <Panel
        title={t("authAutoJoinDomains")}
        description={t("authAutoJoinDomainsDesc")}
      >
        <SettingField
          label={t("authApprovedDomains")}
          htmlFor="verifiedAutoJoinDomains"
          description={
            mode === "saas"
              ? t("authSaasApprovedHelp")
              : t("authPrivateApprovedHelp")
          }
          error={form.error("verifiedAutoJoinDomains")}
        >
          <TagInput
            id="verifiedAutoJoinDomains"
            value={v.verifiedAutoJoinDomains}
            onChange={(verifiedAutoJoinDomains) => form.set({ verifiedAutoJoinDomains })}
            placeholder="acme.com"
            normalize={(d) => d.trim().toLowerCase().replace(/^@/, "")}
            validate={(d) => (DOMAIN_RE.test(d) ? null : t("authInvalidDomain").replace("{domain}", d))}
            aria-invalid={Boolean(form.error("verifiedAutoJoinDomains"))}
          />
        </SettingField>
        {mode === "saas" && v.verifiedAutoJoinDomains.length === 0 && (
          <Callout icon={BadgeCheck} className="mt-4">
            {t("authNoDomains")}
          </Callout>
        )}
      </Panel>

      <Panel title={t("authSessionsMagic")} description={t("authSessionsMagicDesc")}>
        <div className="divide-y divide-border">
          <SettingField
            label={t("authSessionLifetime")}
            htmlFor="sessionDays"
            description={t("authSessionLifetimeDesc")}
            error={form.error("sessionDays")}
          >
            <NumberInput
              id="sessionDays"
              value={v.sessionDays}
              min={1}
              max={3650}
              suffix={t("authDays")}
              onChange={(sessionDays) => form.set({ sessionDays })}
              aria-invalid={Boolean(form.error("sessionDays"))}
            />
          </SettingField>
          <SettingField
            label={t("authLinkValidity")}
            htmlFor="magicLinkMinutes"
            description={t("authLinkValidityDesc")}
            error={form.error("magicLinkMinutes")}
          >
            <NumberInput
              id="magicLinkMinutes"
              value={v.magicLinkMinutes}
              min={5}
              max={120}
              suffix={t("authMinutes")}
              onChange={(magicLinkMinutes) => form.set({ magicLinkMinutes })}
              aria-invalid={Boolean(form.error("magicLinkMinutes"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel
        title={t("authSocialSignIn")}
        description={t("authSocialSignInDesc")}
      >
        <div className="divide-y divide-border">
          <SwitchField
            id="googleLogin"
            label={t("authGoogle")}
            description={
              oauthReady.google ? (
                t("authGoogleReady")
              ) : (
                <>
                  {t("authConfigureGoogle")}{" "}
                  <Link href="/admin/settings/oauth" className="font-medium text-foreground underline underline-offset-2">
                    {t("authOAuthApps")}
                  </Link>{" "}
                  {locale === "it" ? "prima." : "first."}
                </>
              )
            }
            checked={v.googleLogin}
            disabled={!oauthReady.google && !v.googleLogin}
            onCheckedChange={(googleLogin) => form.set({ googleLogin })}
          />
          <SwitchField
            id="microsoftLogin"
            label={t("authMicrosoft")}
            description={
              oauthReady.microsoft ? (
                t("authMicrosoftReady")
              ) : (
                <>
                  {t("authConfigureMicrosoft")}{" "}
                  <Link href="/admin/settings/oauth" className="font-medium text-foreground underline underline-offset-2">
                    {t("authOAuthApps")}
                  </Link>{" "}
                  {locale === "it" ? "prima." : "first."}
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
