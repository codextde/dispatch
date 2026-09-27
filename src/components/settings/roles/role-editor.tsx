"use client"

import { useMemo, useState } from "react"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ColorPicker } from "@/components/settings/color-picker"
import { FormField, MicroLabel } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { createRoleAction, updateRoleAction } from "@/server/workspace/actions/roles"
import type { RoleRow } from "@/server/workspace/queries/roles"
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSIONS, type Permission } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export type RoleEditorTarget =
  | { mode: "create"; from?: RoleRow }
  | { mode: "edit"; role: RoleRow }
  | null

const LOCKOUT: Permission[] = ["roles.manage", "members.manage"]

export function RoleEditor({
  slug,
  target,
  isOwner,
  grantable,
  onClose,
}: {
  slug: string
  target: RoleEditorTarget
  isOwner: boolean
  /** Permissions the actor may grant (null = all) */
  grantable: string[] | null
  onClose: () => void
}) {
  const key = !target ? "none" : target.mode === "edit" ? target.role.id : `new-${target.from?.id ?? ""}`
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        {target && <RoleEditorBody key={key} slug={slug} target={target} isOwner={isOwner} grantable={grantable} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function RoleEditorBody({
  slug,
  target,
  isOwner,
  grantable,
  onClose,
}: {
  slug: string
  target: NonNullable<RoleEditorTarget>
  isOwner: boolean
  grantable: string[] | null
  onClose: () => void
}) {
  const editing = target.mode === "edit" ? target.role : null
  const source = editing ?? (target.mode === "create" ? target.from : undefined)
  const [name, setName] = useState(editing ? editing.name : source ? `${source.name} (copy)` : "")
  const [description, setDescription] = useState(source?.description ?? "")
  const [color, setColor] = useState(source?.color ?? "#64748b")
  const [perms, setPerms] = useState<Set<string>>(() => new Set(source?.permissions ?? []))
  const { pending, run, fieldErrors, setFieldErrors } = useServerAction()

  const grantSet = useMemo(() => (grantable ? new Set(grantable) : null), [grantable])
  const original = useMemo(() => new Set(editing?.permissions ?? []), [editing])
  const canAdd = (p: string) => !grantSet || grantSet.has(p)
  const isLocked = (p: Permission) => !!editing?.isYours && !isOwner && LOCKOUT.includes(p) && original.has(p)
  const toggleable = (p: Permission) => (perms.has(p) ? !isLocked(p) : canAdd(p))

  const setPerm = (p: Permission, on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev)
      if (on) next.add(p)
      else next.delete(p)
      return next
    })

  const toggleGroup = (keys: Permission[]) => {
    const editable = keys.filter(toggleable)
    const allOn = keys.filter((k) => perms.has(k) || canAdd(k)).every((k) => perms.has(k))
    setPerms((prev) => {
      const next = new Set(prev)
      for (const k of editable) {
        if (allOn) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }

  const submit = () => {
    if (!name.trim()) {
      setFieldErrors({ name: "Name is required" })
      return
    }
    const payload = {
      slug,
      name: name.trim(),
      description: description.trim() || null,
      color,
      permissions: ALL_PERMISSIONS.filter((p) => perms.has(p)),
    }
    void run(() => (editing ? updateRoleAction({ ...payload, id: editing.id }) : createRoleAction(payload)), {
      success: editing ? `Role “${payload.name}” saved` : `Role “${payload.name}” created`,
      onSuccess: onClose,
    })
  }

  const nameLocked = !!editing?.isSystem

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <SheetTitle>{editing ? `Edit ${editing.name}` : "New role"}</SheetTitle>
        <SheetDescription>
          {editing?.isSystem
            ? "System roles can't be renamed or deleted, but you can adjust their permissions."
            : "Pick exactly what people with this role can do."}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 border-b px-5 py-5">
          <div className="flex items-end gap-2">
            <FormField label="Name" htmlFor="role-name" error={fieldErrors.name} className="flex-1">
              <Input
                id="role-name"
                value={name}
                maxLength={40}
                disabled={nameLocked}
                placeholder="e.g. Support agent"
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!fieldErrors.name}
              />
            </FormField>
            <ColorPicker value={color} onChange={setColor} label="Role color" />
          </div>
          <FormField label="Description" optional htmlFor="role-description" error={fieldErrors.description}>
            <Textarea
              id="role-description"
              rows={2}
              maxLength={200}
              value={description}
              placeholder="Who is this role for?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="flex items-center justify-between">
            <MicroLabel>Permissions</MicroLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {perms.size} of {ALL_PERMISSIONS.length}
            </span>
          </div>
          {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => {
            const on = keys.filter((k) => perms.has(k)).length
            const state = on === 0 ? false : on === keys.length ? true : "indeterminate"
            const groupId = `perm-group-${group.toLowerCase()}`
            return (
              <fieldset key={group} className="overflow-hidden rounded-lg border">
                <legend className="sr-only">{group}</legend>
                <div className="flex items-center justify-between gap-3 border-b bg-surface/60 px-3 py-2">
                  <label htmlFor={groupId} className="flex items-center gap-2.5 text-[13px] font-medium">
                    <Checkbox
                      id={groupId}
                      checked={state}
                      disabled={!keys.some(toggleable)}
                      onCheckedChange={() => toggleGroup(keys)}
                      aria-label={`Toggle all ${group} permissions`}
                    />
                    {group}
                  </label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {on}/{keys.length}
                  </span>
                </div>
                <ul className="divide-y">
                  {keys.map((p) => {
                    const id = `perm-${p}`
                    const checked = perms.has(p)
                    const disabled = !toggleable(p)
                    const reason = isLocked(p)
                      ? "You can't remove this from your own role."
                      : !checked && !canAdd(p)
                        ? "You don't have this permission yourself, so you can't grant it."
                        : null
                    const row = (
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/30",
                          disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
                        )}
                      >
                        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => setPerm(p, v === true)} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[13px] font-medium">
                            {PERMISSIONS[p].label}
                            {reason && <Lock className="size-3 text-muted-foreground" aria-hidden />}
                          </span>
                          <span className="block text-xs text-pretty text-muted-foreground">{PERMISSIONS[p].description}</span>
                        </span>
                      </label>
                    )
                    return (
                      <li key={p}>
                        {reason ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>{row}</div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-56">
                              {reason}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          row
                        )}
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <span className="text-xs text-muted-foreground">Changes apply immediately to everyone with this role.</span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? "Save role" : "Create role"}
          </Button>
        </div>
      </div>
    </form>
  )
}
