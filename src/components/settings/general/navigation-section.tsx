"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SectionFooter, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { updateWorkspaceNavigation } from "@/server/workspace/actions/general"
import { useI18n } from "@/lib/i18n"

const ITEMS = ["assigned", "mentions", "starred", "snoozed", "drafts", "scheduled", "sent"] as const
const SECTIONS = ["teams", "inboxes", "labels", "chats", "tasks", "contacts"] as const

export function WorkspaceNavigationSection({ slug, initialHiddenItems, initialHiddenSections }: {
  slug: string
  initialHiddenItems: string[]
  initialHiddenSections: string[]
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const [hiddenItems, setHiddenItems] = useState(initialHiddenItems)
  const [hiddenSections, setHiddenSections] = useState(initialHiddenSections)
  const [savedItems, setSavedItems] = useState(initialHiddenItems)
  const [savedSections, setSavedSections] = useState(initialHiddenSections)
  const dirty = JSON.stringify(hiddenItems) !== JSON.stringify(savedItems) || JSON.stringify(hiddenSections) !== JSON.stringify(savedSections)
  const { pending, run } = useServerAction()
  const itemLabels: Record<(typeof ITEMS)[number], string> = {
    assigned: it ? "Assegnate a me" : "Assigned to me",
    mentions: it ? "Menzioni" : "Mentions",
    starred: it ? "Importanti" : "Starred",
    snoozed: it ? "Posticipate" : "Snoozed",
    drafts: it ? "Bozze" : "Drafts",
    scheduled: it ? "Programmate" : "Scheduled",
    sent: it ? "Inviate" : "Sent",
  }
  const sectionLabels: Record<(typeof SECTIONS)[number], string> = {
    teams: it ? "Team" : "Teams",
    inboxes: it ? "Caselle" : "Inboxes",
    labels: it ? "Etichette" : "Labels",
    chats: it ? "Chat" : "Chats",
    tasks: it ? "Attività" : "Tasks",
    contacts: it ? "Contatti" : "Contacts",
  }
  const save = (nextItems: string[], nextSections: string[]) => {
    setHiddenItems(nextItems)
    setHiddenSections(nextSections)
  }

  return (
    <SettingsSection
      title={it ? "Navigazione del workspace" : "Workspace navigation"}
      description={it
        ? "Scegli quali voci e sezioni mostrare a tutti. Puoi nascondere gli strumenti che il team non usa; i dati e i permessi non cambiano."
        : "Choose which items and sections everyone sees. Hide tools your team does not use; this does not change data or permissions."}
      footer={<SectionFooter>
        {dirty && <Button variant="ghost" size="sm" onClick={() => { setHiddenItems(savedItems); setHiddenSections(savedSections) }} disabled={pending}>{it ? "Ripristina" : "Reset"}</Button>}
        <Button size="sm" disabled={!dirty || pending} onClick={() => run(
          () => updateWorkspaceNavigation({ slug, hiddenItems, hiddenSections }),
          { success: it ? "Navigazione aggiornata per il workspace" : "Workspace navigation updated", onSuccess: () => { setSavedItems(hiddenItems); setSavedSections(hiddenSections) } }
        )}>
          {pending && <Loader2 className="animate-spin" />}
          {it ? "Salva modifiche" : "Save changes"}
        </Button>
      </SectionFooter>}
    >
      <SettingsRows>
        {ITEMS.map((item) => <SettingsRow key={item} htmlFor={`workspace-nav-${item}`} label={itemLabels[item]} description={it ? "Mostra questa voce nella navigazione principale." : "Show this item in the main navigation."}>
          <Switch id={`workspace-nav-${item}`} checked={!hiddenItems.includes(item)} onCheckedChange={(checked) => save(checked ? hiddenItems.filter((v) => v !== item) : [...hiddenItems, item], hiddenSections)} />
        </SettingsRow>)}
        {SECTIONS.map((section) => <SettingsRow key={section} htmlFor={`workspace-nav-${section}`} label={sectionLabels[section]} description={it ? "Mostra questa sezione nella barra laterale." : "Show this section in the sidebar."}>
          <Switch id={`workspace-nav-${section}`} checked={!hiddenSections.includes(section)} onCheckedChange={(checked) => save(hiddenItems, checked ? hiddenSections.filter((v) => v !== section) : [...hiddenSections, section])} />
        </SettingsRow>)}
      </SettingsRows>
    </SettingsSection>
  )
}
