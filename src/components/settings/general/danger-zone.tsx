"use client"

import { useState } from "react"
import { DatabaseZap, Loader2, LogOut, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { clearDemoData, deleteWorkspace, leaveWorkspace, loadDemoData } from "@/server/workspace/actions/general"
import { useI18n } from "@/lib/i18n"

export function DemoDataSection({ slug, hasDemo }: { slug: string; hasDemo: boolean }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const { pending, run } = useServerAction()
  const [present, setPresent] = useState(hasDemo)
  return (
    <SettingsSection
      title={it ? "Dati demo" : "Demo data"}
      description={it ? "Esplora Dispatch con un’azienda di esempio realistica: colleghi, due caselle condivise, conversazioni con commenti, chat, attività, contatti, risposte predefinite e una regola." : "Explore Dispatch with a realistic sample company: teammates, two shared inboxes, conversations with comments, chats, tasks, contacts, canned responses and a rule."}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
            <DatabaseZap className="size-4" />
          </span>
          <span className="text-muted-foreground">
            {present
              ? (it ? "I dati demo sono caricati. Rimuovendoli eliminerai solo i dati di esempio, non quelli reali." : "Demo data is loaded. Removing it deletes only the sample records — your real data stays.")
              : (it ? "I dati di esempio sono contrassegnati e si possono rimuovere con un clic." : "Sample data is clearly marked and can be removed in one click.")}
          </span>
        </div>
        {present ? (
          <ConfirmDialog
            title={it ? "Rimuovere i dati demo?" : "Remove demo data?"}
            description={it ? "Saranno eliminati colleghi, caselle, conversazioni, attività e altri dati demo. I tuoi dati non verranno modificati." : "All sample teammates, inboxes, conversations, tasks and other demo records will be deleted. Your own data is not affected."}
            confirmLabel={it ? "Rimuovi dati demo" : "Remove demo data"}
            destructive
            onConfirm={async () => {
              const res = await run(() => clearDemoData({ slug }), { success: it ? "Dati demo rimossi" : "Demo data removed" })
              if (res.ok) setPresent(false)
              return res.ok
            }}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                <Trash2 /> {it ? "Rimuovi dati demo" : "Remove demo data"}
              </Button>
            }
          />
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            disabled={pending}
            onClick={() =>
              run(() => loadDemoData({ slug }), {
                success: (d) => d.skipped ? (it ? "I dati demo sono già caricati" : "Demo data is already loaded") : it ? `Caricate ${d.conversations} conversazioni demo` : `Loaded ${d.conversations} demo conversations`,
                onSuccess: () => setPresent(true),
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? (it ? "Caricamento…" : "Loading…") : (it ? "Carica dati demo" : "Load demo data")}
          </Button>
        )}
      </div>
    </SettingsSection>
  )
}

/** "Leave workspace" button with confirmation. Used on the profile page and in the danger zone. */
export function LeaveWorkspaceButton({ slug, orgName }: { slug: string; orgName: string }) {
  const { t } = useI18n()
  const { run } = useServerAction()
  return (
    <ConfirmDialog
      title={t("leaveWorkspaceTitle").replace("{workspace}", orgName)}
      description={t("leaveWorkspaceDescription")}
      confirmLabel={t("leaveWorkspaceConfirm")}
      destructive
      onConfirm={async () => {
        const res = await run(() => leaveWorkspace({ slug }), { success: t("leaveWorkspaceSuccess").replace("{workspace}", orgName) })
        if (res.ok) window.location.assign(res.data.redirectTo)
        return res.ok
      }}
      trigger={
        <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive">
          <LogOut /> {t("leaveWorkspaceConfirm")}
        </Button>
      }
    />
  )
}

export function DangerZone({ slug, orgName, isOwner, hasSubscription }: { slug: string; orgName: string; isOwner: boolean; hasSubscription: boolean }) {
  const { locale } = useI18n()
  const it = locale === "it"
  const { run } = useServerAction()
  return (
    <SettingsSection tone="danger" title={it ? "Zona pericolosa" : "Danger zone"} description={it ? "Azioni irreversibili. Procedi con attenzione." : "Irreversible actions. Please be certain."}>
      <SettingsRows>
        <SettingsRow label={it ? "Abbandona workspace" : "Leave workspace"} description={it ? "Rimuovi il tuo account da questo workspace. I proprietari devono prima trasferire la proprietà." : "Remove yourself from this workspace. Owners must hand over ownership first."}>
          <LeaveWorkspaceButton slug={slug} orgName={orgName} />
        </SettingsRow>
        {isOwner && (
          <SettingsRow
            label={it ? "Elimina workspace" : "Delete workspace"}
            description={it ? "Elimina definitivamente il workspace con tutte le caselle, le conversazioni, i membri, le impostazioni e la cronologia." : "Permanently delete the workspace with all inboxes, conversations, members, settings and history."}
          >
            <ConfirmDialog
              title={it ? `Eliminare ${orgName}?` : `Delete ${orgName}?`}
              description={
                <>
                  {it ? "Verranno eliminate definitivamente tutte le conversazioni, i commenti, i contatti, le attività, le connessioni delle caselle e le impostazioni del workspace, insieme a tutti i membri. " : "This permanently deletes every conversation, comment, contact, task, inbox connection and setting in this workspace and removes all members. "}{hasSubscription && (it ? "L’abbonamento verrà annullato subito. " : "The subscription is canceled immediately. ")}{it ? "L’operazione non si può annullare." : "This cannot be undone."}
                </>
              }
              confirmText={slug}
              confirmLabel={it ? "Elimina workspace" : "Delete workspace"}
              destructive
              onConfirm={async () => {
                const res = await run(() => deleteWorkspace({ slug, confirm: slug }), { success: it ? `${orgName} è stato eliminato` : `${orgName} was deleted` })
                if (res.ok) window.location.assign(res.data.redirectTo)
                return res.ok
              }}
              trigger={
                <Button size="sm" className="shrink-0 bg-destructive text-white hover:bg-destructive/90">
                  <Trash2 /> {it ? "Elimina workspace" : "Delete workspace"}
                </Button>
              }
            />
          </SettingsRow>
        )}
      </SettingsRows>
    </SettingsSection>
  )
}
