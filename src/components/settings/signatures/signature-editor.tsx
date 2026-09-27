"use client"

import { useMemo, useState } from "react"
import { Globe, Loader2, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { MultiCombobox } from "@/components/settings/combobox"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { RichTextEditor, SIGNATURE_VARIABLES } from "@/components/settings/rich-text-editor"
import { FormField, MicroLabel } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { createSignature, deleteSignature, updateSignature } from "@/server/workspace/actions/signatures"
import { cn } from "@/lib/utils"
import { isBlankHtml } from "../responses/text"
import { SignaturePreview, type PreviewUser } from "./signature-preview"

export type SignatureScope = "personal" | "workspace"

export type SignatureDraft = {
  id?: string
  name: string
  body: string
  scope: SignatureScope
  accountIds: string[]
}

export type AccountOption = {
  id: string
  name: string
  email: string
  color: string
  personal: boolean
  signatureId: string | null
}

export function SignatureEditor({
  slug,
  draft: initialDraft,
  accounts,
  signatureNames,
  canManageWorkspace,
  previewUser,
  onClose,
}: {
  slug: string
  draft: SignatureDraft
  accounts: AccountOption[]
  /** id → name, to explain which signature an inbox currently uses */
  signatureNames: Map<string, string>
  canManageWorkspace: boolean
  previewUser: PreviewUser
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SignatureDraft>(initialDraft)
  const [showErrors, setShowErrors] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { pending, run, fieldErrors } = useServerAction()
  const isNew = !draft.id
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const set = <K extends keyof SignatureDraft>(k: K, v: SignatureDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const clientErrors: Record<string, string> = {}
  if (!draft.name.trim()) clientErrors.name = "Name is required"
  if (isBlankHtml(draft.body)) clientErrors.body = "Write the signature"
  const errors = { ...(showErrors ? clientErrors : {}), ...fieldErrors }

  const assignable = useMemo(
    () => accounts.filter((a) => (draft.scope === "workspace" ? !a.personal : a.personal)),
    [accounts, draft.scope]
  )
  const accountOptions = assignable.map((a) => {
    const current = a.signatureId && a.signatureId !== draft.id ? signatureNames.get(a.signatureId) : undefined
    return {
      value: a.id,
      label: a.name,
      hint: current ? `uses “${current}”` : a.email,
      icon: <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />,
    }
  })

  const requestClose = () => {
    if (pending) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = () => {
    setShowErrors(true)
    if (Object.keys(clientErrors).length) return
    const payload = {
      slug,
      name: draft.name.trim(),
      body: draft.body,
      scope: draft.scope,
      accountIds: draft.accountIds.filter((id) => assignable.some((a) => a.id === id)),
    }
    void run(() => (draft.id ? updateSignature({ ...payload, id: draft.id }) : createSignature(payload)), {
      success: isNew ? "Signature created" : "Signature saved",
      onSuccess: onClose,
    })
  }

  const scopeOption = (value: SignatureScope, label: string, description: string, Icon: typeof Globe) => {
    const active = draft.scope === value
    const disabled = value === "workspace" && !canManageWorkspace
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => {
          if (active) return
          // Inbox defaults differ per scope (shared vs. personal inboxes)
          setDraft((d) => ({ ...d, scope: value, accountIds: [] }))
        }}
        className={cn(
          "flex flex-1 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          active ? "border-foreground/30 bg-surface ring-1 ring-foreground/10" : "hover:bg-muted/50"
        )}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && requestClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault()
          }}
        >
          <SheetHeader className="border-b px-5 py-4 pr-12">
            <SheetTitle>{isNew ? "New signature" : "Edit signature"}</SheetTitle>
            <SheetDescription>Variables are replaced with the sender&apos;s details when a message is sent.</SheetDescription>
          </SheetHeader>

          <form
            id="signature-form"
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <FormField label="Name" htmlFor="signature-name" error={errors.name} description="Only visible to your team, e.g. “Support team” or “Short”.">
              <Input
                id="signature-name"
                autoFocus={isNew}
                value={draft.name}
                maxLength={80}
                placeholder="e.g. Support team"
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => set("name", e.target.value)}
              />
            </FormField>

            <FormField
              label="Type"
              description={!canManageWorkspace ? "Only members with “Manage signatures” can create workspace signatures." : undefined}
            >
              <div role="radiogroup" aria-label="Signature type" className="flex flex-col gap-2 sm:flex-row">
                {scopeOption("personal", "Personal", "Only you can use it", User)}
                {scopeOption("workspace", "Workspace", "Shared inboxes and the whole team", Globe)}
              </div>
            </FormField>

            <FormField label="Signature" error={errors.body}>
              <RichTextEditor
                value={draft.body}
                onChange={(html) => set("body", html)}
                placeholder="{{user.name}} · {{user.title}}"
                variables={SIGNATURE_VARIABLES}
                allowImages
                minHeight={140}
                aria-invalid={Boolean(errors.body)}
              />
            </FormField>

            <FormField
              label="Default for inboxes"
              optional
              description={
                assignable.length === 0
                  ? draft.scope === "workspace"
                    ? "No shared inboxes yet — connect one in Settings → Inboxes."
                    : "Connect a personal inbox to use this as its default."
                  : "Added automatically when replying from these inboxes. An inbox has one default signature."
              }
              error={fieldErrors.accountIds}
            >
              <MultiCombobox
                options={accountOptions}
                value={draft.accountIds}
                onChange={(v) => set("accountIds", v)}
                placeholder={assignable.length ? "Choose inboxes…" : "No inboxes available"}
                disabled={assignable.length === 0}
                searchPlaceholder="Search inboxes…"
              />
            </FormField>

            <div className="flex flex-col gap-2">
              <MicroLabel>Preview · as {previewUser.name}</MicroLabel>
              <SignaturePreview body={draft.body} user={previewUser} />
            </div>
          </form>

          <div className="flex items-center justify-between gap-2 border-t bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div>
              {!isNew && (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}>
                      <Trash2 /> <span className="hidden sm:inline">Delete</span>
                    </Button>
                  }
                  title={`Delete “${initialDraft.name}”?`}
                  description={
                    initialDraft.accountIds.length
                      ? `It is the default signature of ${initialDraft.accountIds.length} inbox${initialDraft.accountIds.length === 1 ? "" : "es"}; they will have no default signature. This can't be undone.`
                      : "This can't be undone."
                  }
                  confirmLabel="Delete signature"
                  destructive
                  onConfirm={async () => {
                    const res = await run(() => deleteSignature({ slug, id: draft.id! }), { success: "Signature deleted" })
                    if (res.ok) onClose()
                    return res.ok
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form="signature-form" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {isNew ? "Create signature" : "Save changes"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="Your edits to this signature will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          onClose()
        }}
      />
    </>
  )
}
