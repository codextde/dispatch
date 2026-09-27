"use client"

import { ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Panel, StatusBadge } from "@/components/admin/ui"
import { CopyField } from "@/components/admin/client"
import { SecretInput } from "@/components/admin/secret-input"
import { SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"

export type OAuthSettingsValue = {
  google: { enabled: boolean; clientId: string; clientSecretEnc: string }
  microsoft: { enabled: boolean; clientId: string; clientSecretEnc: string; tenant: string }
}

type ProviderInfo = { redirectUri: string; scopes: string[]; usedForLogin: boolean }

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:text-brand"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="grid list-none gap-2.5 text-[13px] leading-relaxed text-muted-foreground [counter-reset:step]">{children}</ol>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-7 [counter-increment:step] before:absolute before:top-0 before:left-0 before:flex before:size-5 before:items-center before:justify-center before:rounded-full before:border before:border-border before:bg-surface before:font-mono before:text-[10px] before:text-foreground before:content-[counter(step)]">
      {children}
    </li>
  )
}

function ScopeList({ scopes }: { scopes: string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {scopes.map((s) => (
        <code key={s} className="rounded border border-border bg-surface px-1.5 py-px font-mono text-[11.5px] text-foreground">
          {s}
        </code>
      ))}
    </span>
  )
}

function statusOf(cfg: { enabled: boolean; clientId: string; clientSecretEnc: string }) {
  const complete = Boolean(cfg.clientId && cfg.clientSecretEnc)
  if (cfg.enabled && complete) return <StatusBadge tone="ok">Active</StatusBadge>
  if (complete) return <StatusBadge tone="neutral">Configured · disabled</StatusBadge>
  return <StatusBadge tone="neutral" dot={false}>Not configured</StatusBadge>
}

export function OAuthSettingsForm({
  initial,
  google,
  microsoft,
}: {
  initial: OAuthSettingsValue
  google: ProviderInfo
  microsoft: ProviderInfo
}) {
  const form = useSettingsForm("oauth", initial)
  const g = form.values.google
  const m = form.values.microsoft
  return (
    <SettingsFormShell form={form}>
      <Panel
        title="Google"
        description="Connect Gmail and Google Workspace inboxes with one click, and optionally offer “Sign in with Google”."
        actions={statusOf(form.baseline.google)}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="divide-y divide-border">
            <SwitchField
              id="google-enabled"
              label="Enable Google"
              description={google.usedForLogin ? "Also used for Google sign-in (Authentication settings)." : "Used to connect Gmail inboxes."}
              checked={g.enabled}
              onCheckedChange={(enabled) => form.setIn("google.enabled", enabled)}
            />
            <SettingField label="Client ID" htmlFor="google-client-id" error={form.error("google.clientId")}>
              <Input
                id="google-client-id"
                value={g.clientId}
                placeholder="1234567890-abc.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[13px]"
                onChange={(e) => form.setIn("google.clientId", e.target.value)}
              />
            </SettingField>
            <SettingField label="Client secret" htmlFor="google-client-secret">
              <SecretInput
                key={form.formKey}
                id="google-client-secret"
                preview={form.secretPreview("google.clientSecretEnc")}
                value={form.secrets["google.clientSecretEnc"]}
                onChange={(v) => form.setSecret("google.clientSecretEnc", v)}
                placeholder="GOCSPX-…"
              />
            </SettingField>
            <SettingField label="Authorized redirect URI" description="Register exactly this URI in the Google Cloud console.">
              <CopyField value={google.redirectUri} />
            </SettingField>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Setup · Google Cloud</div>
            <Steps>
              <Step>
                Create or pick a project in the <ExtLink href="https://console.cloud.google.com/projectcreate">Google Cloud console</ExtLink>.
              </Step>
              <Step>
                Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink>.
              </Step>
              <Step>
                Configure the <ExtLink href="https://console.cloud.google.com/apis/credentials/consent">OAuth consent screen</ExtLink> and add
                the scopes:
                <ScopeList scopes={google.scopes} />
                <span className="mt-1 block">
                  <code className="font-mono text-[11.5px]">https://mail.google.com/</code> is a restricted scope: internal (Workspace-only)
                  apps work right away, public apps need Google&apos;s verification.
                </span>
              </Step>
              <Step>
                Create an <ExtLink href="https://console.cloud.google.com/apis/credentials">OAuth client ID</ExtLink> of type{" "}
                <em>Web application</em> with the redirect URI shown here, then paste the client ID and secret.
              </Step>
            </Steps>
          </div>
        </div>
      </Panel>

      <Panel
        title="Microsoft"
        description="Connect Outlook and Microsoft 365 mailboxes, and optionally offer “Sign in with Microsoft”."
        actions={statusOf(form.baseline.microsoft)}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="divide-y divide-border">
            <SwitchField
              id="microsoft-enabled"
              label="Enable Microsoft"
              description={
                microsoft.usedForLogin ? "Also used for Microsoft sign-in (Authentication settings)." : "Used to connect Outlook / Microsoft 365 inboxes."
              }
              checked={m.enabled}
              onCheckedChange={(enabled) => form.setIn("microsoft.enabled", enabled)}
            />
            <SettingField label="Application (client) ID" htmlFor="microsoft-client-id" error={form.error("microsoft.clientId")}>
              <Input
                id="microsoft-client-id"
                value={m.clientId}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[13px]"
                onChange={(e) => form.setIn("microsoft.clientId", e.target.value)}
              />
            </SettingField>
            <SettingField label="Client secret value" htmlFor="microsoft-client-secret">
              <SecretInput
                key={form.formKey}
                id="microsoft-client-secret"
                preview={form.secretPreview("microsoft.clientSecretEnc")}
                value={form.secrets["microsoft.clientSecretEnc"]}
                onChange={(v) => form.setSecret("microsoft.clientSecretEnc", v)}
                placeholder="Secret value (not the secret ID)"
              />
            </SettingField>
            <SettingField
              label="Tenant"
              htmlFor="microsoft-tenant"
              description={
                <>
                  <code className="font-mono text-[12px]">common</code> allows work, school and personal accounts;{" "}
                  <code className="font-mono text-[12px]">organizations</code> only work/school accounts; or enter your tenant ID or domain
                  to restrict sign-in to your organization.
                </>
              }
              error={form.error("microsoft.tenant")}
            >
              <Input
                id="microsoft-tenant"
                value={m.tenant}
                placeholder="common"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[13px] sm:max-w-xs"
                onChange={(e) => form.setIn("microsoft.tenant", e.target.value)}
                aria-invalid={Boolean(form.error("microsoft.tenant"))}
              />
            </SettingField>
            <SettingField label="Redirect URI" description="Add it as a Web platform redirect URI in your app registration.">
              <CopyField value={microsoft.redirectUri} />
            </SettingField>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Setup · Microsoft Entra ID</div>
            <Steps>
              <Step>
                Open{" "}
                <ExtLink href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">App registrations</ExtLink>{" "}
                and create a new registration. For <em>common</em>, choose “Accounts in any organizational directory and personal Microsoft
                accounts”.
              </Step>
              <Step>
                Under <em>Authentication</em>, add a <em>Web</em> platform with the redirect URI shown here.
              </Step>
              <Step>
                Under <em>API permissions</em>, add these delegated permissions:
                <ScopeList scopes={microsoft.scopes} />
              </Step>
              <Step>
                Under <em>Certificates &amp; secrets</em>, create a client secret and paste its <em>value</em> together with the Application
                (client) ID. Note the expiry date — renew it before it lapses.
              </Step>
            </Steps>
          </div>
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
