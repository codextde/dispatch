"use client"

import { useMemo, useState } from "react"
import { Globe, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ColorSwatches, randomPresetColor } from "@/components/settings/color-picker"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { FormField } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { createLabel, updateLabel } from "@/server/workspace/actions/labels"
import { cn } from "@/lib/utils"
import { LabelChip } from "./label-chip"
import { descendantIds, flattenLabels, MAX_LABEL_DEPTH, subtreeHeight, type LabelItem } from "./label-utils"

export type LabelDialogState =
  | { mode: "create"; visibility: "shared" | "private"; parentId: string | null }
  | { mode: "edit"; label: LabelItem }

type FormState = {
  name: string
  color: string
  parentId: string | null
  visibility: "shared" | "private"
  showInSidebar: boolean
}

function initialForm(state: LabelDialogState): FormState {
  if (state.mode === "edit") {
    const { name, color, parentId, visibility, showInSidebar } = state.label
    return { name, color, parentId, visibility, showInSidebar }
  }
  return { name: "", color: randomPresetColor(), parentId: state.parentId, visibility: state.visibility, showInSidebar: true }
}

export function LabelDialog({
  slug,
  state,
  onClose,
  labels,
  canManageShared,
}: {
  slug: string
  state: LabelDialogState
  onClose: () => void
  /** All labels the member can see (shared + own private) */
  labels: LabelItem[]
  canManageShared: boolean
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(state))
  const { pending, run, fieldErrors } = useServerAction()
  const editing = state.mode === "edit" ? state.label : null
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const hasChildren = editing ? labels.some((l) => l.parentId === editing.id) : false
  // Visibility can change for new labels, or for top-level labels when the member can manage shared labels
  const visibilityLocked = editing ? !canManageShared || Boolean(editing.parentId) : !canManageShared

  const parentOptions = useMemo<ComboOption[]>(() => {
    const scoped = labels.filter((l) => l.visibility === form.visibility)
    const blocked = editing ? descendantIds(editing.id, scoped) : new Set<string>()
    const height = editing ? subtreeHeight(editing.id, scoped) : 1
    const opts: ComboOption[] = [{ value: "__root__", label: "No parent (top level)" }]
    for (const l of flattenLabels(scoped)) {
      if (editing && (l.id === editing.id || blocked.has(l.id))) continue
      const tooDeep = l.depth + height > MAX_LABEL_DEPTH
      opts.push({
        value: l.id,
        label: l.path,
        disabled: tooDeep,
        hint: tooDeep ? "too deep" : undefined,
        icon: <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />,
      })
    }
    return opts
  }, [labels, form.visibility, editing])

  const nameError = fieldErrors.name
  const canSave = form.name.trim().length > 0 && !pending

  const save = () => {
    if (!canSave) return
    const payload = { slug, ...form, name: form.name.trim() }
    void run(() => (editing ? updateLabel({ ...payload, id: editing.id }) : createLabel(payload)), {
      success: editing ? "Label saved" : "Label created",
      onSuccess: onClose,
    })
  }

  const scopeCard = (value: "shared" | "private", title: string, description: string, Icon: typeof Globe) => {
    const active = form.visibility === value
    const disabled = visibilityLocked && !active
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => {
          if (active) return
          setForm((f) => ({ ...f, visibility: value, parentId: null }))
        }}
        className={cn(
          "flex flex-1 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          active ? "border-foreground/30 bg-surface ring-1 ring-foreground/10" : "hover:bg-muted/50"
        )}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
      </button>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit label" : "New label"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply everywhere this label is used." : "Use labels to group conversations across inboxes."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <FormField label="Name" htmlFor="label-name" error={nameError}>
            <div className="flex items-center gap-2">
              <Input
                id="label-name"
                autoFocus
                value={form.name}
                maxLength={60}
                placeholder="e.g. Billing"
                aria-invalid={Boolean(nameError)}
                onChange={(e) => set("name", e.target.value)}
              />
              <LabelChip name={form.name.trim() || "Preview"} color={form.color} className="hidden max-w-40 shrink-0 sm:inline-flex" />
            </div>
          </FormField>

          <FormField label="Color">
            <ColorSwatches value={form.color} onChange={(c) => set("color", c)} />
          </FormField>

          <FormField
            label="Visibility"
            description={
              visibilityLocked && editing?.parentId
                ? "Nested labels share their parent's visibility."
                : !canManageShared
                  ? "You can create private labels. Ask an admin to add workspace labels."
                  : hasChildren
                    ? "Nested labels move along when you change visibility."
                    : undefined
            }
          >
            <div role="radiogroup" aria-label="Visibility" className="flex flex-col gap-2 sm:flex-row">
              {scopeCard("shared", "Workspace", "Everyone can use it", Globe)}
              {scopeCard("private", "Private", "Only visible to you", Lock)}
            </div>
          </FormField>

          <FormField
            label="Parent label"
            htmlFor="label-parent"
            optional
            description={`Nest labels up to ${MAX_LABEL_DEPTH} levels deep.`}
            error={fieldErrors.parentId}
          >
            <Combobox
              id="label-parent"
              options={parentOptions}
              value={form.parentId ?? "__root__"}
              onChange={(v) => set("parentId", !v || v === "__root__" ? null : v)}
              disabled={Boolean(editing) && form.visibility !== editing?.visibility}
              searchPlaceholder="Search labels…"
            />
          </FormField>

          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Show in sidebar</span>
              <span className="block text-xs text-muted-foreground">List this label as its own mailbox in the inbox sidebar.</span>
            </span>
            <Switch checked={form.showInSidebar} onCheckedChange={(v) => set("showInSidebar", v)} aria-label="Show in sidebar" />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save label" : "Create label"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
