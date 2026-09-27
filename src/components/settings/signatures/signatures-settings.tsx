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
  const used = item.accountIds.map((id) => accounts.get(id)).filter(Boolean) as AccountOption[]
  return (
    <li className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        {item.scope === "workspace" ? (
          <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-label="Workspace signature" />
        ) : (
          <User className="size-3.5 shrink-0 text-muted-foreground" aria-label="Personal signature" />
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
                <Pencil /> Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy /> {item.editable ? "Duplicate" : "Duplicate as personal"}
            </DropdownMenuItem>
            {item.editable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete
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
            <span>Default for</span>
            {used.map((a) => (
              <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-surface px-1.5 py-0.5 text-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <span className="truncate">{a.name}</span>
              </span>
            ))}
          </>
        ) : (
          <span>
            Not the default for any inbox · updated <LocalTime date={item.updatedAt} format="relative" titleFormat="datetime" />
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
      eyebrow="Productivity"
      title="Signatures"
      quiet="that sign off every reply"
      description="Signatures are added to outgoing messages. Set a default per inbox, and use variables so one workspace signature works for the whole team."
      width="wide"
      actions={
        <Button onClick={() => setEditing(newDraft("personal"))}>
          <Plus /> New signature
        </Button>
      }
    >
      <SettingsSection
        title="Workspace signatures"
        description="Shared signatures for shared inboxes. Each teammate's details are filled in when they send."
        action={
          canManageWorkspace ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(newDraft("workspace"))}>
              <Plus /> Add
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Managed by admins
            </span>
          )
        }
      >
        {workspace.length ? (
          renderGrid(workspace)
        ) : (
          <EmptyState
            icon={<PenLine />}
            title="No workspace signatures"
            description={
              canManageWorkspace
                ? "Create a consistent signature for your shared inboxes — with {{user.name}} it adapts to whoever replies."
                : "Admins haven't created a workspace signature yet."
            }
          >
            {canManageWorkspace && (
              <Button size="sm" onClick={() => setEditing(newDraft("workspace"))}>
                <Plus /> Create workspace signature
              </Button>
            )}
          </EmptyState>
        )}
      </SettingsSection>

      <SettingsSection
        title="My signatures"
        description="Personal signatures you can pick in the composer or set as the default of your own inboxes."
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing(newDraft("personal"))}>
            <Plus /> Add
          </Button>
        }
      >
        {personal.length ? (
          renderGrid(personal)
        ) : (
          <EmptyState icon={<User />} title="No personal signatures" description="Add a signature with your name, title and contact details.">
            <Button size="sm" variant="outline" onClick={() => setEditing(newDraft("personal"))}>
              <Plus /> Create my signature
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
            ? `It is the default signature of ${deleting.accountIds.length} inbox${deleting.accountIds.length === 1 ? "" : "es"}; they will have no default signature. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete signature"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          const res = await run(() => deleteSignature({ slug, id: deleting.id }), { success: "Signature deleted" })
          return res.ok
        }}
      />
    </SettingsPage>
  )
}
