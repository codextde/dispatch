"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SectionFooter, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { updateWorkspaceFeatures } from "@/server/workspace/actions/general"
import { useI18n } from "@/lib/i18n"

export function WorkspaceFeaturesSection({ slug, chatEnabled }: { slug: string; chatEnabled: boolean }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const [enabled, setEnabled] = useState(chatEnabled)
  const [saved, setSaved] = useState(chatEnabled)
  const dirty = enabled !== saved
  const { pending, run } = useServerAction()

  return (
    <SettingsSection
      title={it ? "Funzionalità" : "Features"}
      description={it ? "Scegli quali strumenti sono disponibili per tutti i membri del workspace." : "Choose which tools are available to everyone in this workspace."}
      footer={
        <SectionFooter>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setEnabled(saved)} disabled={pending}>
              {it ? "Ripristina" : "Reset"}
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() =>
              run(() => updateWorkspaceFeatures({ slug, chat: enabled }), {
                success: it ? "Funzionalità del workspace salvate" : "Workspace features saved",
                onSuccess: () => setSaved(enabled),
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {it ? "Salva modifiche" : "Save changes"}
          </Button>
        </SectionFooter>
      }
    >
      <SettingsRows>
        <SettingsRow
          htmlFor="feature-chat"
          label={it ? "Chat interna" : "Internal chat"}
          description={it
            ? "Mostra Chat nella barra laterale e permette ai membri di aprire conversazioni interne. Disattivandola, le chat esistenti non saranno eliminate."
            : "Show Chat in the sidebar and let members start internal conversations. Turning it off does not delete existing chats."}
        >
          <Switch id="feature-chat" checked={enabled} onCheckedChange={setEnabled} />
        </SettingsRow>
      </SettingsRows>
    </SettingsSection>
  )
}
