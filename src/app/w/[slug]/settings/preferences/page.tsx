import type { Metadata } from "next"
import { requireOrgPage } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { SettingsPage } from "@/components/settings/settings-ui"
import { PreferencesForm } from "@/components/settings/personal/preferences-form"

export const metadata: Metadata = { title: "Preferences" }

export default async function PreferencesPage({ params }: PageProps<"/w/[slug]/settings/preferences">) {
  const { slug } = await params
  const ctx = await requireOrgPage(slug)
  const security = await getSettings("security")
  const p = ctx.user.preferences ?? {}
  return (
    <SettingsPage
      eyebrow={ctx.user.locale === "it" ? "Personale" : "Personal"}
      title={ctx.user.locale === "it" ? "Preferenze" : "Preferences"}
      quiet={ctx.user.locale === "it" ? "— personalizza Dispatch." : "— make Dispatch yours."}
      description={ctx.user.locale === "it" ? "Queste preferenze si applicano a te in ogni workspace." : "These settings apply to you in every workspace."}
    >
      <PreferencesForm
        slug={ctx.org.slug}
        workspaceUndoSeconds={ctx.org.settings.undoSendSeconds ?? 5}
        instanceRemoteImages={security.remoteImages}
        initial={{
          theme: p.theme ?? "system",
          density: p.density ?? "comfortable",
          shortcuts: p.shortcuts ?? "dispatch",
          locale: ctx.user.locale === "it" ? "it" : "en",
          sendAndArchive: p.sendAndArchive ?? false,
          undoSendSeconds: typeof p.undoSendSeconds === "number" ? p.undoSendSeconds : null,
          loadRemoteImages: p.loadRemoteImages ?? security.remoteImages,
        }}
      />
    </SettingsPage>
  )
}
