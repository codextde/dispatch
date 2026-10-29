"use client"

import { ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Panel, StatusBadge } from "@/components/admin/ui"
import { CopyField } from "@/components/admin/client"
import { SecretInput } from "@/components/admin/secret-input"
import { SettingField, SettingsFormShell, SwitchField, useSettingsForm } from "@/components/admin/settings/form"
import { useI18n } from "@/lib/i18n"

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

function statusOf(cfg: { enabled: boolean; clientId: string; clientSecretEnc: string }, it: boolean) {
  const complete = Boolean(cfg.clientId && cfg.clientSecretEnc)
  if (cfg.enabled && complete) return <StatusBadge tone="ok">{it ? "Attivo" : "Active"}</StatusBadge>
  if (complete) return <StatusBadge tone="neutral">{it ? "Configurato · disattivato" : "Configured · disabled"}</StatusBadge>
  return <StatusBadge tone="neutral" dot={false}>{it ? "Non configurato" : "Not configured"}</StatusBadge>
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
  const { locale } = useI18n()
  const it = locale === "it"
  const form = useSettingsForm("oauth", initial)
  const g = form.values.google
  const m = form.values.microsoft
  return (
    <SettingsFormShell form={form}>
      <Panel
        title="Google"
        description={it ? "Collega con un clic le caselle Gmail e Google Workspace e, se vuoi, consenti l’accesso con Google." : "Connect Gmail and Google Workspace inboxes with one click, and optionally offer “Sign in with Google”."}
        actions={statusOf(form.baseline.google, it)}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="divide-y divide-border">
            <SwitchField
              id="google-enabled"
              label={it ? "Attiva Google" : "Enable Google"}
              description={google.usedForLogin ? (it ? "Usato anche per l’accesso con Google (impostazioni di autenticazione)." : "Also used for Google sign-in (Authentication settings).") : (it ? "Usato per collegare le caselle Gmail." : "Used to connect Gmail inboxes.")}
              checked={g.enabled}
              onCheckedChange={(enabled) => form.setIn("google.enabled", enabled)}
            />
            <SettingField label="ID client" htmlFor="google-client-id" error={form.error("google.clientId")}>
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
            <SettingField label={it ? "Segreto client" : "Client secret"} htmlFor="google-client-secret">
              <SecretInput
                key={form.formKey}
                id="google-client-secret"
                preview={form.secretPreview("google.clientSecretEnc")}
                value={form.secrets["google.clientSecretEnc"]}
                onChange={(v) => form.setSecret("google.clientSecretEnc", v)}
                placeholder="GOCSPX-…"
              />
            </SettingField>
            <SettingField label={it ? "URI di reindirizzamento autorizzato" : "Authorized redirect URI"} description={it ? "Registra esattamente questo URI nella console Google Cloud." : "Register exactly this URI in the Google Cloud console."}>
              <CopyField value={google.redirectUri} />
            </SettingField>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{it ? "Configurazione · Google Cloud" : "Setup · Google Cloud"}</div>
            <Steps>
              <Step>
                {it ? "Crea o seleziona un progetto nella " : "Create or pick a project in the "}<ExtLink href="https://console.cloud.google.com/projectcreate">{it ? "console Google Cloud" : "Google Cloud console"}</ExtLink>.
              </Step>
              <Step>
                {it ? "Attiva l’" : "Enable the "}<ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">API Gmail</ExtLink>.
              </Step>
              <Step>
                {it ? "Configura la " : "Configure the "}<ExtLink href="https://console.cloud.google.com/apis/credentials/consent">{it ? "schermata di consenso OAuth" : "OAuth consent screen"}</ExtLink> {it ? "e aggiungi gli ambiti:" : "and add the scopes:"}
                <ScopeList scopes={google.scopes} />
                <span className="mt-1 block">
                  <code className="font-mono text-[11.5px]">https://mail.google.com/</code>{it ? " è un ambito soggetto a restrizioni: le app interne (solo Workspace) funzionano subito, quelle pubbliche richiedono la verifica di Google." : " is a restricted scope: internal (Workspace-only) apps work right away, public apps need Google's verification."}
                </span>
              </Step>
              <Step>
                {it ? "Crea un " : "Create an "}<ExtLink href="https://console.cloud.google.com/apis/credentials">{it ? "ID client OAuth" : "OAuth client ID"}</ExtLink> {it ? "di tipo " : "of type "}<em>{it ? "Applicazione web" : "Web application"}</em>{it ? " con l’URI di reindirizzamento mostrato qui, poi incolla l’ID client e il segreto." : " with the redirect URI shown here, then paste the client ID and secret."}
              </Step>
            </Steps>
          </div>
        </div>
      </Panel>

      <Panel
        title="Microsoft"
        description={it ? "Collega le caselle Outlook e Microsoft 365 e, se vuoi, consenti l’accesso con Microsoft." : "Connect Outlook and Microsoft 365 mailboxes, and optionally offer “Sign in with Microsoft”."}
        actions={statusOf(form.baseline.microsoft, it)}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="divide-y divide-border">
            <SwitchField
              id="microsoft-enabled"
              label={it ? "Attiva Microsoft" : "Enable Microsoft"}
              description={
                microsoft.usedForLogin ? (it ? "Usato anche per l’accesso con Microsoft (impostazioni di autenticazione)." : "Also used for Microsoft sign-in (Authentication settings).") : (it ? "Usato per collegare le caselle Outlook / Microsoft 365." : "Used to connect Outlook / Microsoft 365 inboxes.")
              }
              checked={m.enabled}
              onCheckedChange={(enabled) => form.setIn("microsoft.enabled", enabled)}
            />
            <SettingField label={it ? "ID applicazione (client)" : "Application (client) ID"} htmlFor="microsoft-client-id" error={form.error("microsoft.clientId")}>
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
            <SettingField label={it ? "Valore del segreto client" : "Client secret value"} htmlFor="microsoft-client-secret">
              <SecretInput
                key={form.formKey}
                id="microsoft-client-secret"
                preview={form.secretPreview("microsoft.clientSecretEnc")}
                value={form.secrets["microsoft.clientSecretEnc"]}
                onChange={(v) => form.setSecret("microsoft.clientSecretEnc", v)}
                placeholder={it ? "Valore del segreto (non l’ID del segreto)" : "Secret value (not the secret ID)"}
              />
            </SettingField>
            <SettingField
              label="Tenant"
              htmlFor="microsoft-tenant"
              description={
                <>
                  <code className="font-mono text-[12px]">common</code> {it ? "consente account aziendali, scolastici e personali; " : "allows work, school and personal accounts; "}
                  <code className="font-mono text-[12px]">organizations</code> {it ? "solo account aziendali o scolastici; oppure inserisci l’ID tenant o il dominio per limitare l’accesso alla tua organizzazione." : "only work/school accounts; or enter your tenant ID or domain to restrict sign-in to your organization."}
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
            <SettingField label={it ? "URI di reindirizzamento" : "Redirect URI"} description={it ? "Aggiungilo come URI di reindirizzamento della piattaforma Web nella registrazione dell’app." : "Add it as a Web platform redirect URI in your app registration."}>
              <CopyField value={microsoft.redirectUri} />
            </SettingField>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{it ? "Configurazione · Microsoft Entra ID" : "Setup · Microsoft Entra ID"}</div>
            <Steps>
              <Step>
                {it ? "Apri " : "Open "}
                <ExtLink href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">{it ? "Registrazioni app" : "App registrations"}</ExtLink>{" "}
                {it ? "e crea una nuova registrazione. Per " : "and create a new registration. For "}<em>common</em>{it ? ", scegli “Account in qualsiasi directory organizzativa e account Microsoft personali”." : ", choose “Accounts in any organizational directory and personal Microsoft accounts”."}
              </Step>
              <Step>
                {it ? "In " : "Under "}<em>{it ? "Autenticazione" : "Authentication"}</em>{it ? ", aggiungi una piattaforma " : ", add a "}<em>Web</em>{it ? " con l’URI di reindirizzamento mostrato qui." : " platform with the redirect URI shown here."}
              </Step>
              <Step>
                {it ? "In " : "Under "}<em>{it ? "Autorizzazioni API" : "API permissions"}</em>{it ? ", aggiungi queste autorizzazioni delegate:" : ", add these delegated permissions:"}
                <ScopeList scopes={microsoft.scopes} />
              </Step>
              <Step>
                {it ? "In " : "Under "}<em>{it ? "Certificati e segreti" : "Certificates &amp; secrets"}</em>{it ? ", crea un segreto client e incollane il " : ", create a client secret and paste its "}<em>{it ? "valore" : "value"}</em>{it ? " insieme all’ID applicazione (client). Prendi nota della scadenza e rinnovalo prima che scada." : " together with the Application (client) ID. Note the expiry date — renew it before it lapses."}
              </Step>
              <Step>
                {it ? "Per " : "For "}<em>Sign in with Microsoft</em>{it ? ": in " : ": under "}<em>{it ? "Configurazione token" : "Token configuration"}</em>{it ? ", aggiungi le attestazioni facoltative del token ID" : ", add the optional ID-token claims"}{" "}
                <code className="font-mono text-[12px]">email</code> and <code className="font-mono text-[12px]">xms_edov</code> (verified-domain
                {it ? " (indicatore del dominio verificato). Gli account aziendali senza queste attestazioni non potranno accedere la prima volta." : " (verified-domain flag). Work accounts without them can&apos;t sign in the first time."}
              </Step>
            </Steps>
          </div>
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
