"use client"

import { useMemo, useState } from "react"
import { Copy, Globe, Lock, MoreHorizontal, PenLine, Pencil, Plus, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { LocalTime } from "@/components/app/local-time"
import { EmptyState, SettingsPage, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { deleteSignature } from "@/server/workspace/actions/signatures"
import { SignatureEditor, type AccountOption, type SignatureDraft, type SignatureScope } from "./signature-editor"
import { SignaturePreview, type PreviewUser } from "./signature-preview"
import { useI18n } from "@/lib/i18n"

export type SignatureItem = {
  id: string
  name: string
  body: string
  scope: SignatureScope
  accountIds: string[]
  updatedAt: Date
  editable: boolean
}

function SignatureCard({
  item,
  accounts,
  previewUser,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: SignatureItem
  accounts: Map<string, AccountOption>
  previewUser: PreviewUser
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const used = item.accountIds.map((id) => accounts.get(id)).filter(Boolean) as AccountOption[]
  return (
    <li className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        {item.scope === "workspace" ? (
          <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("workspaceSignature")} />
        ) : (
          <User className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("personalSignature")} />
        )}
        <button
          type="button"
          onClick={item.editable ? onEdit : onDuplicate}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={item.editable ? `Edit ${item.name}` : `Duplicate ${item.name} as a personal signature`}
        >
          {item.name}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.name}`} className="-mr-1.5 text-muted-foreground">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {item.editable && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> {t("editSignature")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy /> {item.editable ? t("duplicateSignature") : t("duplicatePersonal")}
            </DropdownMenuItem>
            {item.editable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> {t("deleteSignature")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="px-3.5">
        <SignaturePreview body={item.body} user={previewUser} compact className="border-dashed bg-surface/40" />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 px-3.5 pt-3 pb-3 text-xs text-muted-foreground">
        {used.length ? (
          <>
            <span>{t("defaultFor")}</span>
            {used.map((a) => (
              <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-surface px-1.5 py-0.5 text-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <span className="truncate">{a.name}</span>
              </span>
            ))}
          </>
        ) : (
          <span>
            {t("noDefaultInbox")} · {t("updated")} <LocalTime date={item.updatedAt} format="relative" titleFormat="datetime" />
          </span>
        )}
      </div>
    </li>
  )
}

export function SignaturesSettings({
  slug,
  signatures,
  accounts,
  previewUser,
  canManageWorkspace,
}: {
  slug: string
  signatures: SignatureItem[]
  accounts: AccountOption[]
  previewUser: PreviewUser
  canManageWorkspace: boolean
}) {
  const { t, locale } = useI18n()
  const [editing, setEditing] = useState<SignatureDraft | null>(null)
  const [deleting, setDeleting] = useState<SignatureItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { run } = useServerAction()
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const signatureNames = useMemo(() => new Map(signatures.map((s) => [s.id, s.name])), [signatures])
  const workspace = signatures.filter((s) => s.scope === "workspace")
  const personal = signatures.filter((s) => s.scope === "personal")

  const newDraft = (scope: SignatureScope): SignatureDraft => ({
    name: "",
    body: "<p><strong>{{user.name}}</strong><br>{{user.title}}<br>{{user.email}}</p>",
    scope,
    accountIds: [],
  })
  const toDraft = (s: SignatureItem): SignatureDraft => ({ id: s.id, name: s.name, body: s.body, scope: s.scope, accountIds: s.accountIds })
  const duplicate = (s: SignatureItem) =>
    setEditing({
      name: `${s.name} (copy)`.slice(0, 80),
      body: s.body,
      scope: s.editable ? s.scope : "personal",
      accountIds: [],
    })

  const renderGrid = (items: SignatureItem[]) => (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((s) => (
        <SignatureCard
          key={s.id}
          item={s}
          accounts={accountMap}
          previewUser={previewUser}
          onEdit={() => setEditing(toDraft(s))}
          onDuplicate={() => duplicate(s)}
          onDelete={() => {
            setDeleting(s)
            setDeleteOpen(true)
          }}
        />
      ))}
    </ul>
  )

  return (
    <SettingsPage
      eyebrow={t("productivity")}
      title={t("signaturesTitle")}
      quiet={t("signaturesQuiet")}
      description={t("signaturesDescription")}
      width="wide"
      actions={
        <Button onClick={() => setEditing(newDraft("personal"))}>
          <Plus /> {t("newSignature")}
        </Button>
      }
    >
      <SettingsSection
        title={t("workspaceSignatures")}
        description={t("workspaceSignaturesDescription")}
        action={
          canManageWorkspace ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(newDraft("workspace"))}>
              <Plus /> {t("add")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> {t("managedByAdmins")}
            </span>
          )
        }
      >
        {workspace.length ? (
          renderGrid(workspace)
        ) : (
          <EmptyState
            icon={<PenLine />}
            title={t("noWorkspaceSignatures")}
            description={
              canManageWorkspace
                ? "Create a consistent signature for your shared inboxes — with {{user.name}} it adapts to whoever replies."
                : "Admins haven't created a workspace signature yet."
            }
          >
            {canManageWorkspace && (
              <Button size="sm" onClick={() => setEditing(newDraft("workspace"))}>
                <Plus /> {t("createWorkspaceSignature")}
              </Button>
            )}
          </EmptyState>
        )}
      </SettingsSection>

      <SettingsSection
        title={t("mySignatures")}
        description={t("personalSignaturesDescription")}
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing(newDraft("personal"))}>
            <Plus /> {t("add")}
          </Button>
        }
      >
        {personal.length ? (
          renderGrid(personal)
        ) : (
          <EmptyState icon={<User />} title={t("noPersonalSignatures")} description={t("signatureDetailsDescription")}>
            <Button size="sm" variant="outline" onClick={() => setEditing(newDraft("personal"))}>
              <Plus /> {t("createMySignature")}
            </Button>
          </EmptyState>
        )}
      </SettingsSection>

      {editing && (
        <SignatureEditor
          key={editing.id ?? `new-${editing.scope}-${editing.name}`}
          slug={slug}
          draft={editing}
          accounts={accounts}
          signatureNames={signatureNames}
          canManageWorkspace={canManageWorkspace}
          previewUser={previewUser}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.accountIds.length
            ? (locale === "it" ? `È la firma predefinita di ${deleting.accountIds.length} caselle: non avranno più una firma predefinita. Questa azione non può essere annullata.` : `It is the default signature of ${deleting.accountIds.length} inbox${deleting.accountIds.length === 1 ? "" : "es"}; they will have no default signature. This can't be undone.`)
            : (locale === "it" ? "Questa azione non può essere annullata." : "This can't be undone.")
        }
        confirmLabel={locale === "it" ? "Elimina firma" : "Delete signature"}
        destructive
        onConfirm={async () => {
          if (!deleting) return
          const res = await run(() => deleteSignature({ slug, id: deleting.id }), { success: locale === "it" ? "Firma eliminata" : "Signature deleted" })
          return res.ok
        }}
      />
    </SettingsPage>
  )
}
