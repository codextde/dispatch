"use client"

import { useState } from "react"
import { Copy, KeyRound, Loader2, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserAvatar } from "@/components/app/user-avatar"
import { pluralize } from "@/components/settings/format"
import { ColorDot, EmptyState, FormField, SettingsPage, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { RoleEditor, type RoleEditorTarget } from "@/components/settings/roles/role-editor"
import { deleteRoleAction } from "@/server/workspace/actions/roles"
import type { RoleRow, RolesPageData } from "@/server/workspace/queries/roles"
import { ALL_PERMISSIONS } from "@/lib/permissions"

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px] tracking-wide whitespace-nowrap text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export function RolesSettings({ slug, data }: { slug: string; data: RolesPageData }) {
  const { roles, isOwner, grantable } = data
  const [editor, setEditor] = useState<RoleEditorTarget>(null)
  const [deleting, setDeleting] = useState<RoleRow | null>(null)
  const system = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)
  const canGrantAll = (r: RoleRow) => r.key !== "owner" && (!grantable || r.permissions.every((p) => grantable.includes(p)))

  const row = (r: RoleRow) => {
    // Owner is fixed; roles with permissions you don't have can't be edited or deleted by you
    const outranks = r.key !== "owner" && !canGrantAll(r)
    const locked = r.key === "owner" || outranks
    return (
      <li key={r.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ColorDot color={r.color ?? "#64748b"} className="mt-1.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-semibold">{r.name}</span>
              {r.isSystem && <Tag>System</Tag>}
              {r.isDefault && <Tag>Default</Tag>}
              {r.isYours && <Tag>Your role</Tag>}
            </div>
            <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
              {r.description || "No description"}
              <span className="text-subtle"> · </span>
              {r.key === "owner" ? "All permissions" : `${r.permissions.length} of ${ALL_PERMISSIONS.length} permissions`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-5 sm:pl-0">
          <div className="flex items-center gap-2" title={pluralize(r.memberCount, "member")}>
            {r.sampleMembers.length > 0 && (
              <div className="flex -space-x-1.5">
                {r.sampleMembers.slice(0, 4).map((m) => (
                  <UserAvatar key={m.userId} name={m.name} email={m.email} src={m.avatarUrl} size="xs" className="ring-2 ring-card" />
                ))}
              </div>
            )}
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {pluralize(r.memberCount, "member")}
              {r.pendingInvitations > 0 && ` · ${r.pendingInvitations} invited`}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            {locked ? (
              <span
                className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground"
                title={outranks ? "This role has permissions you don't have" : "The Owner role always has every permission"}
              >
                <Lock className="size-3" /> Locked
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditor({ mode: "edit", role: r })}>
                <Pencil /> Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${r.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled={!canGrantAll(r)} onClick={() => setEditor({ mode: "create", from: r })}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                {!r.isSystem && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={outranks} onClick={() => setDeleting(r)}>
                      <Trash2 /> Delete role
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </li>
    )
  }

  return (
    <SettingsPage
      eyebrow="Workspace"
      title="Roles"
      quiet="& permissions"
      description="Every member has one role. Roles decide what people can do in the workspace; which inboxes they see is managed per inbox."
      actions={
        <Button onClick={() => setEditor({ mode: "create" })}>
          <Plus /> New role
        </Button>
      }
    >
      <SettingsSection flush title="System roles" description="Created with every workspace. The Owner role always has full access.">
        <ul className="divide-y border-t">{system.map(row)}</ul>
      </SettingsSection>

      <SettingsSection
        flush
        title="Custom roles"
        description="Tailor access for agents, contractors or read-only observers."
      >
        {custom.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<KeyRound />}
              title="No custom roles yet"
              description="Start from scratch or duplicate a system role and adjust its permissions."
            >
              <Button variant="outline" size="sm" onClick={() => setEditor({ mode: "create" })}>
                <Plus /> Create a role
              </Button>
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y border-t">{custom.map(row)}</ul>
        )}
      </SettingsSection>

      <RoleEditor slug={slug} target={editor} isOwner={isOwner} grantable={grantable} onClose={() => setEditor(null)} />
      <DeleteRoleDialog
        key={deleting?.id ?? "none"}
        slug={slug}
        role={deleting}
        roles={roles}
        grantable={grantable}
        isOwner={isOwner}
        onClose={() => setDeleting(null)}
      />
    </SettingsPage>
  )
}

function DeleteRoleDialog({
  slug,
  role,
  roles,
  grantable,
  isOwner,
  onClose,
}: {
  slug: string
  role: RoleRow | null
  roles: RoleRow[]
  grantable: string[] | null
  isOwner: boolean
  onClose: () => void
}) {
  const inUse = !!role && role.memberCount + role.pendingInvitations > 0
  const options = roles.filter(
    (r) =>
      r.id !== role?.id &&
      (r.key === "owner" ? isOwner : !grantable || r.permissions.every((p) => grantable.includes(p)))
  )
  const fallback = options.find((r) => r.key === "member")?.id ?? options[0]?.id ?? ""
  const [target, setTarget] = useState(fallback)
  const { pending, run } = useServerAction()

  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{role?.name}”?</DialogTitle>
          <DialogDescription>
            {inUse
              ? `${[
                  role!.memberCount ? pluralize(role!.memberCount, "member") : null,
                  role!.pendingInvitations ? pluralize(role!.pendingInvitations, "pending invitation") : null,
                ]
                  .filter(Boolean)
                  .join(" and ")} ${role!.memberCount + role!.pendingInvitations === 1 ? "has" : "have"} this role. Choose where to move them.`
              : "Nobody has this role. It will be removed permanently."}
          </DialogDescription>
        </DialogHeader>
        {inUse && (
          <FormField label="Move to" htmlFor="reassign-role">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="reassign-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <ColorDot color={r.color ?? "#64748b"} className="size-2" />
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/80"
            disabled={pending || (inUse && !target)}
            onClick={() =>
              role &&
              void run(() => deleteRoleAction({ slug, id: role.id, reassignToRoleId: inUse ? target : null }), {
                success: `Role “${role.name}” deleted`,
                onSuccess: onClose,
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
