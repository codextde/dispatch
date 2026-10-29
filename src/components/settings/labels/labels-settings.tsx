"use client"

import { useState } from "react"
import { Lock, Plus, Tags } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { pluralize } from "@/components/settings/format"
import { EmptyState, SectionFooter, SettingsPage, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { deleteLabel, reorderLabels, updateLabel } from "@/server/workspace/actions/labels"
import { LabelDialog, type LabelDialogState } from "./label-dialog"
import { LabelTree, type TreeHandlers } from "./label-tree"
import { descendantIds, MAX_LABEL_DEPTH, type LabelItem } from "./label-utils"
import { useI18n } from "@/lib/i18n"

type Data = { shared: LabelItem[]; private: LabelItem[] }

export function LabelsSettings({
  slug,
  orgName,
  initial,
  canManageShared,
}: {
  slug: string
  orgName: string
  initial: Data
  canManageShared: boolean
}) {
  const { t, locale } = useI18n()
  const it = locale === "it"
  // Local copy for optimistic reordering; re-synced when the server data changes
  const [data, setData] = useState<Data>(initial)
  const [synced, setSynced] = useState<Data>(initial)
  if (synced !== initial) {
    setSynced(initial)
    setData(initial)
  }

  const [dialog, setDialog] = useState<LabelDialogState | null>(null)
  const [deleting, setDeleting] = useState<LabelItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { run } = useServerAction()
  const all = [...data.shared, ...data.private]

  const handlersFor = (scope: "shared" | "private"): TreeHandlers => ({
    onEdit: (label) => setDialog({ mode: "edit", label }),
    onAddChild: (parent) => setDialog({ mode: "create", visibility: scope, parentId: parent.id }),
    onDelete: (label) => {
      setDeleting(label)
      setDeleteOpen(true)
    },
    onToggleSidebar: (label) => {
      void run(
        () =>
          updateLabel({
            slug,
            id: label.id,
            name: label.name,
            color: label.color,
            parentId: label.parentId,
            visibility: label.visibility,
            showInSidebar: !label.showInSidebar,
          }),
        { success: label.showInSidebar ? `“${label.name}” hidden from the sidebar` : `“${label.name}” shown in the sidebar` }
      )
    },
    onReorder: async (parentId, orderedIds) => {
      const previous = data
      const pos = new Map(orderedIds.map((id, i) => [id, i]))
      setData((d) => ({ ...d, [scope]: d[scope].map((l) => (pos.has(l.id) ? { ...l, position: pos.get(l.id)! } : l)) }))
      const res = await run(() => reorderLabels({ slug, scope, parentId, orderedIds }))
      if (!res.ok) setData(previous)
      return res.ok
    },
  })

  const deleteInfo = deleting
    ? (() => {
        const descendants = descendantIds(deleting.id, all)
        const nestedConversations = all.filter((l) => descendants.has(l.id)).reduce((n, l) => n + l.conversationCount, 0)
        return { descendants: descendants.size, conversations: deleting.conversationCount + nestedConversations }
      })()
    : null

  return (
    <SettingsPage
      eyebrow={it ? "Produttività" : "Productivity"}
      title={t("labelsTitle")}
      quiet={it ? "per organizzare ogni conversazione" : "to organize every conversation"}
      description={it ? "Le etichette raggruppano le conversazioni tra caselle e possono comparire nella barra laterale come caselle autonome. Le etichette del workspace sono condivise; quelle private sono visibili solo a te." : "Labels group conversations across inboxes and can appear as their own mailboxes in the sidebar. Workspace labels are shared with everyone; private labels are only visible to you."}
      actions={
        <Button onClick={() => setDialog({ mode: "create", visibility: canManageShared ? "shared" : "private", parentId: null })}>
          <Plus /> {t("newLabel")}
        </Button>
      }
    >
      <SettingsSection
        title={t("workspaceLabels")}
        description={it ? `Condivise con tutti in ${orgName}.` : `Shared with everyone in ${orgName}.`}
        action={
          canManageShared ? (
            <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "create", visibility: "shared", parentId: null })}>
              <Plus /> {t("add")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> {t("managedByAdmins")}
            </span>
          )
        }
        flush
        footer={
          data.shared.length > 0 && (
            <SectionFooter
              hint={
                canManageShared
                  ? (it ? `Trascina per riordinare. Le etichette possono avere fino a ${MAX_LABEL_DEPTH} livelli.` : `Drag to reorder. Labels can be nested up to ${MAX_LABEL_DEPTH} levels deep.`)
                  : (it ? "Puoi applicare le etichette del workspace, ma solo chi ha il permesso “Gestisci etichette condivise” può modificarle." : "You can apply workspace labels, but only members with “Manage shared labels” can change them.")
              }
            />
          )
        }
      >
        {data.shared.length ? (
          <LabelTree labels={data.shared} editable={canManageShared} handlers={handlersFor("shared")} ariaLabel={it ? "Etichette workspace" : "Workspace labels"} />
        ) : (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Tags />}
              title={t("noWorkspaceLabels")}
              description={canManageShared ? (it ? "Crea etichette come “Fatturazione” o “Bug” per gestire le conversazioni più rapidamente." : "Create labels like “Billing” or “Bug” to triage faster.") : (it ? "Gli amministratori non hanno ancora creato etichette condivise." : "Admins haven't created any shared labels yet.")}
            >
              {canManageShared && (
                <Button size="sm" onClick={() => setDialog({ mode: "create", visibility: "shared", parentId: null })}>
                  <Plus /> {t("createLabel")}
                </Button>
              )}
            </EmptyState>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title={t("myPrivateLabels")}
        description={it ? "Solo tu puoi vedere queste etichette e le conversazioni a cui sono applicate." : "Only you can see these labels and which conversations they're on."}
        action={
          <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "create", visibility: "private", parentId: null })}>
            <Plus /> {t("add")}
          </Button>
        }
        flush
        footer={data.private.length > 0 && <SectionFooter hint={it ? "Trascina per riordinare le etichette private." : "Drag to reorder your private labels."} />}
      >
        {data.private.length ? (
          <LabelTree labels={data.private} editable handlers={handlersFor("private")} ariaLabel={it ? "Le mie etichette private" : "My private labels"} />
        ) : (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Lock />}
              title={t("noPrivateLabels")}
              description={it ? "Organizza i tuoi promemoria personali, ad esempio “Da leggere” o “In attesa di risposta”…" : "Keep personal follow-ups organized — “To read”, “Waiting on reply”…"}
            >
              <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "create", visibility: "private", parentId: null })}>
                <Plus /> {t("createPrivateLabel")}
              </Button>
            </EmptyState>
          </div>
        )}
      </SettingsSection>

      {dialog && (
        <LabelDialog
          key={dialog.mode === "edit" ? dialog.label.id : `new-${dialog.visibility}-${dialog.parentId}`}
          slug={slug}
          state={dialog}
          onClose={() => setDialog(null)}
          labels={all}
          canManageShared={canManageShared}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleteInfo && (
            <>
              {deleteInfo.conversations > 0
                ? `It will be removed from ${pluralize(deleteInfo.conversations, "conversation")}.`
                : "It isn't applied to any conversations."}
              {deleteInfo.descendants > 0 && ` Its ${pluralize(deleteInfo.descendants, "nested label")} will be deleted too.`} This can&apos;t be undone.
            </>
          )
        }
        confirmLabel={t("deleteLabel")}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          const res = await run(() => deleteLabel({ slug, id: deleting.id }))
          if (res.ok) {
            toast.success(res.data.removedLabels > 1 ? `Deleted ${res.data.removedLabels} labels` : "Label deleted")
          }
          return res.ok
        }}
      />
    </SettingsPage>
  )
}
