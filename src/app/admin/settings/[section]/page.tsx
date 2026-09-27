import type { Metadata } from "next"
import path from "node:path"
import { notFound } from "next/navigation"
import { requireSuperAdminPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { redactForAdmin } from "@/server/admin/settings"
import { getDataDir, getDomain } from "@/server/env"
import { oauthRedirectUri } from "@/server/oauth/common"
import { googleScopes } from "@/server/oauth/google"
import { microsoftScopes } from "@/server/oauth/microsoft"
import { AdminPageHeader, type Tone } from "@/components/admin/ui"
import { SETTINGS_SECTIONS, type SettingsSectionSlug } from "@/components/admin/nav"
import { SECTION_HEADERS } from "@/app/admin/settings/sections"
import { GeneralSettingsForm } from "@/components/admin/settings/general-form"
import { AuthSettingsForm } from "@/components/admin/settings/auth-form"
import { EmailSettingsForm } from "@/components/admin/settings/email-form"
import { OAuthSettingsForm } from "@/components/admin/settings/oauth-form"
import { StorageSettingsForm } from "@/components/admin/settings/storage-form"
import { AiSettingsForm } from "@/components/admin/settings/ai-form"
import { BrandingSettingsForm } from "@/components/admin/settings/branding-form"
import { SecuritySettingsForm } from "@/components/admin/settings/security-form"
import { LegalSettingsForm } from "@/components/admin/settings/legal-form"

function isSection(value: string): value is SettingsSectionSlug {
  return SETTINGS_SECTIONS.some((s) => s.slug === value)
}

export async function generateMetadata({ params }: PageProps<"/admin/settings/[section]">): Promise<Metadata> {
  const { section } = await params
  const meta = SETTINGS_SECTIONS.find((s) => s.slug === section)
  return { title: meta ? `${meta.label} · Settings` : "Settings" }
}

export default async function AdminSettingsSectionPage({ params }: PageProps<"/admin/settings/[section]">) {
  const { user } = await requireSuperAdminPage()
  const { section } = await params
  if (!isSection(section)) notFound()

  const header = SECTION_HEADERS[section]
  return (
    <>
      <AdminPageHeader eyebrow="Settings" title={header.title} quiet={header.quiet} description={header.description} />
      <SectionForm section={section} adminEmail={user.email} />
    </>
  )
}

async function SectionForm({ section, adminEmail }: { section: SettingsSectionSlug; adminEmail: string }) {
  switch (section) {
    case "general":
      return <GeneralSettingsForm initial={await getSettings("general")} />

    case "authentication": {
      const [auth, oauth, general] = await Promise.all([getSettings("auth"), getSettings("oauth"), getSettings("general")])
      const ready = (c: { enabled: boolean; clientId: string; clientSecretEnc: string }) =>
        c.enabled && Boolean(c.clientId && c.clientSecretEnc)
      return (
        <AuthSettingsForm
          initial={auth}
          mode={general.mode}
          oauthReady={{ google: ready(oauth.google), microsoft: ready(oauth.microsoft) }}
        />
      )
    }

    case "email": {
      const email = await getSettings("email")
      return (
        <EmailSettingsForm
          initial={redactForAdmin(email)}
          status={emailStatus(email)}
          adminEmail={adminEmail}
          defaultFromEmail={`no-reply@${getDomain().replace(/:\d+$/, "")}`}
        />
      )
    }

    case "oauth": {
      const [oauth, auth] = await Promise.all([getSettings("oauth"), getSettings("auth")])
      const msScopes = microsoftScopes("connect")
        .split(" ")
        .map((s) => s.replace(/^https:\/\/outlook\.office\.com\//, ""))
      return (
        <OAuthSettingsForm
          initial={redactForAdmin(oauth)}
          google={{ redirectUri: oauthRedirectUri("google"), scopes: googleScopes("connect").split(" "), usedForLogin: auth.googleLogin }}
          microsoft={{ redirectUri: oauthRedirectUri("microsoft"), scopes: msScopes, usedForLogin: auth.microsoftLogin }}
        />
      )
    }

    case "billing":
      // Served by ./billing/page.tsx (static route) so the Stripe module only loads there.
      notFound()

    case "storage": {
      const storage = await getSettings("storage")
      return <StorageSettingsForm initial={redactForAdmin(storage)} localPath={path.join(getDataDir(), "storage")} />
    }

    case "ai":
      return <AiSettingsForm initial={redactForAdmin(await getSettings("ai"))} />

    case "branding":
      return <BrandingSettingsForm initial={await getSettings("branding")} />

    case "security": {
      const [security, general] = await Promise.all([getSettings("security"), getSettings("general")])
      return <SecuritySettingsForm initial={security} mode={general.mode} />
    }

    case "legal":
      return <LegalSettingsForm initial={await getSettings("legal")} />
  }
}

function emailStatus(email: Awaited<ReturnType<typeof getSettings<"email">>>): { tone: Tone; label: string } {
  if (email.provider === "ses") {
    return email.user && email.passwordEnc
      ? { tone: "ok", label: `Delivering via Amazon SES (${email.sesRegion})` }
      : { tone: "warn", label: "Amazon SES — credentials missing" }
  }
  if (email.provider === "smtp") {
    return email.host
      ? { tone: "ok", label: `Delivering via ${email.host}:${email.port}` }
      : { tone: "warn", label: "SMTP host missing — printing to logs" }
  }
  return { tone: "warn", label: "Not configured — printing to logs" }
}
