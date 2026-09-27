"use client"

import { useMemo, useState } from "react"
import {
  Ban,
  Clock,
  Link2,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { copyToClipboard, CopyField } from "@/components/settings/copy-button"
import { formatDate, formatDateTime, fromNow, pluralize } from "@/components/settings/format"
import { ColorDot, EmptyState, SettingsPage, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { InviteDialog } from "@/components/settings/members/invite-dialog"
import {
  changeMemberRoleAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  setMemberStatusAction,
} from "@/server/workspace/actions/members"
import type { InvitationRow, MemberRow, MembersPageData } from "@/server/workspace/queries/members"
import { cn } from "@/lib/utils"

type Teams = MembersPageData["teams"]

type PendingConfirm =
  | { kind: "role"; member: MemberRow; roleId: string }
  | { kind: "suspend"; member: MemberRow }
  | { kind: "remove"; member: MemberRow }
  | { kind: "revoke"; invitation: InvitationRow }
  | null

export function MembersSettings({ slug, orgName, data }: { slug: string; orgName: string; data: MembersPageData }) {
  const { members, invitations, roles, teams, canManage, canInvite, canAssignTeams, emailDelivery, defaultRoleId } = data
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all")
  const [roleFilter, setRoleFilter] = useState("all")
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)
  const { run } = useServerAction()

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const suspendedCount = members.filter((m) => m.status === "suspended").length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      if (status !== "all" && m.status !== status) return false
      if (roleFilter !== "all" && m.roleId !== roleFilter) return false
      if (!q) return true
      return [m.name, m.email, m.title, roleById.get(m.roleId)?.name].some((v) => v?.toLowerCase().includes(q))
    })
  }, [members, query, status, roleFilter, roleById])

  const requestRoleChange = (member: MemberRow, roleId: string) => {
    if (roleId === member.roleId) return
    const target = roleById.get(roleId)
    if (target?.key === "owner" || member.isYou) setConfirm({ kind: "role", member, roleId })
    else void changeRole(member, roleId)
  }

  const changeRole = (member: MemberRow, roleId: string) =>
    run(() => changeMemberRoleAction({ slug, userId: member.userId, roleId }), {
      success: (d) => `Changed ${member.name || member.email}'s role to ${d.roleName}`,
    })

  const setMemberStatus = (member: MemberRow, next: "active" | "suspended") =>
    run(() => setMemberStatusAction({ slug, userId: member.userId, status: next }), {
      success: next === "suspended" ? `${member.name || member.email} was suspended` : `${member.name || member.email} was reactivated`,
    })

  const shareLink = (inv: InvitationRow, sendEmail: boolean) =>
    run(() => resendInvitationAction({ slug, id: inv.id, sendEmail }), {
      success: (d) => (d.delivered ? `Invitation re-sent to ${d.email}` : ""),
      onSuccess: (d) => {
        if (!d.delivered) {
          setLink({ email: d.email, url: d.url })
          void copyToClipboard(d.url, "New invite link copied")
        }
      },
    })

  const teamChips = (ids: string[]) => {
    const list = ids.map((id) => teamById.get(id)).filter(Boolean) as Teams
    if (!list.length) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {list.slice(0, 2).map((t) => (
          <span key={t.id} className="inline-flex h-5 max-w-32 items-center gap-1 rounded-md border bg-surface px-1.5 text-[11px]">
            <ColorDot color={t.color} className="size-1.5" />
            <span className="truncate">{t.name}</span>
          </span>
        ))}
        {list.length > 2 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] text-muted-foreground">
                +{list.length - 2}
              </span>
            </TooltipTrigger>
            <TooltipContent>{list.slice(2).map((t) => t.name).join(", ")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  const roleControl = (m: MemberRow, className?: string) => {
    const role = roleById.get(m.roleId)
    if (!m.manageable) {
      return (
        <span className={cn("inline-flex items-center gap-1.5 text-[13px]", className)}>
          <ColorDot color={role?.color ?? "#64748b"} className="size-2" />
          {role?.name ?? "—"}
        </span>
      )
    }
    return (
      <Select value={m.roleId} onValueChange={(v) => requestRoleChange(m, v)}>
        <SelectTrigger size="sm" className={cn("w-36", className)} aria-label={`Role of ${m.name || m.email}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {roles.map((r) => (
            <SelectItem key={r.id} value={r.id} disabled={!r.grantable && r.id !== m.roleId}>
              <ColorDot color={r.color ?? "#64748b"} className="size-2" />
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const rowMenu = (m: MemberRow) => {
    if (!m.manageable || m.isYou) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name || m.email}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {m.status === "active" ? (
            <DropdownMenuItem onClick={() => setConfirm({ kind: "suspend", member: m })}>
              <Ban /> Suspend access
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => void setMemberStatus(m, "active")}>
              <UserCheck /> Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm({ kind: "remove", member: m })}>
            <UserMinus /> Remove from workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const identity = (m: MemberRow) => (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} className={cn(m.status === "suspended" && "opacity-50 grayscale")} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{m.name || m.email.split("@")[0]}</span>
          {m.isYou && (
            <span className="rounded bg-muted px-1 py-px font-mono text-[10px] tracking-wide text-muted-foreground uppercase">You</span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {m.email}
          {m.title && <span className="hidden lg:inline"> · {m.title}</span>}
        </div>
      </div>
    </div>
  )

  const statusBadge = (m: MemberRow) =>
    m.status === "active" ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="warning">Suspended</StatusBadge>

  const confirmMember = confirm && "member" in confirm ? confirm.member : null
  const confirmName = confirmMember ? confirmMember.name || confirmMember.email : ""

  return (
    <SettingsPage
      width="wide"
      eyebrow="Workspace"
      title="Members"
      quiet="& invitations"
      description={`Everyone with access to ${orgName}. Roles decide what people can do; inbox access is managed per inbox.`}
      actions={
        canInvite && (
          <InviteDialog
            slug={slug}
            orgName={orgName}
            roles={roles}
            teams={canAssignTeams ? teams : []}
            defaultRoleId={defaultRoleId}
            emailDelivery={emailDelivery}
          />
        )
      }
    >
      <SettingsSection
        flush
        title={pluralize(members.length, "member")}
        description={suspendedCount ? `${suspendedCount} suspended` : "People who can sign in to this workspace."}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search members"
                className="pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="flex-1 sm:w-32" aria-label="Filter by role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectItem value="all">All roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="flex-1 sm:w-32" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<Users />}
              title="No matching members"
              description="Try a different search or clear the filters."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("")
                  setRoleFilter("all")
                  setStatus("all")
                }}
              >
                Clear filters
              </Button>
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto border-t md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b bg-surface/50 text-left">
                    {["Member", "Role", "Teams", "Status", "Last active", "Joined"].map((h) => (
                      <th key={h} scope="col" className="h-9 px-3 font-mono text-[10.5px] font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase first:pl-5">
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="w-12 pr-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((m) => (
                    <tr key={m.userId} className="transition-colors hover:bg-muted/30">
                      <td className="max-w-72 py-2.5 pr-3 pl-5">{identity(m)}</td>
                      <td className="px-3 py-2.5">{roleControl(m)}</td>
                      <td className="px-3 py-2.5">{teamChips(m.teamIds)}</td>
                      <td className="px-3 py-2.5">{statusBadge(m)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground" title={formatDateTime(m.lastSeenAt, "Never")}>
                        {m.lastSeenAt ? fromNow(m.lastSeenAt) : "Never"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(m.joinedAt)}</td>
                      <td className="py-2.5 pr-3 text-right">{rowMenu(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="divide-y border-t md:hidden">
              {filtered.map((m) => (
                <li key={m.userId} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    {identity(m)}
                    {rowMenu(m)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-11">
                    {roleControl(m, "h-7")}
                    {statusBadge(m)}
                    <span className="text-xs text-muted-foreground">
                      {m.lastSeenAt ? `Active ${fromNow(m.lastSeenAt)}` : "Never signed in"}
                    </span>
                  </div>
                  {m.teamIds.length > 0 && <div className="pl-11">{teamChips(m.teamIds)}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
      </SettingsSection>

      {canInvite && (
        <SettingsSection
          flush
          title="Pending invitations"
          description={
            invitations.length
              ? `${pluralize(invitations.length, "invitation")} waiting to be accepted.`
              : "Invitations you send show up here until they're accepted."
          }
        >
          {invitations.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={<Mail />} title="No pending invitations" description="Invite teammates to collaborate on shared inboxes." />
            </div>
          ) : (
            <ul className="divide-y border-t">
              {invitations.map((inv) => {
                const role = roleById.get(inv.roleId)
                return (
                  <li key={inv.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed bg-surface text-muted-foreground">
                        <Mail className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{inv.email}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Invited {inv.invitedByYou ? "by you" : inv.invitedByName ? `by ${inv.invitedByName}` : ""} {fromNow(inv.createdAt)}
                          {inv.teamIds.length > 0 &&
                            ` · ${inv.teamIds
                              .map((id) => teamById.get(id)?.name)
                              .filter(Boolean)
                              .join(", ")}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-11 sm:pl-0">
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <ColorDot color={role?.color ?? "#64748b"} className="size-2" />
                        {role?.name ?? "—"}
                      </span>
                      {inv.expired ? (
                        <StatusBadge tone="danger">Expired</StatusBadge>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground" title={formatDateTime(inv.expiresAt)}>
                          <Clock className="size-3" /> Expires {fromNow(inv.expiresAt)}
                        </span>
                      )}
                      {inv.manageable && (
                        <div className="ml-auto flex items-center gap-1 sm:ml-2">
                          {emailDelivery && (
                            <Button variant="outline" size="sm" onClick={() => void shareLink(inv, true)}>
                              <RefreshCw /> Resend
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for invitation to ${inv.email}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuItem onClick={() => void shareLink(inv, false)}>
                                <Link2 /> Copy new invite link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setConfirm({ kind: "revoke", invitation: inv })}>
                                <XCircle /> Revoke invitation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SettingsSection>
      )}

      {!canManage && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <ShieldCheck className="size-4" /> Only people with the “Manage members” permission can change roles or remove members.
        </p>
      )}

      {/* Confirmations */}
      <ConfirmDialog
        open={confirm?.kind === "role"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === "role" && roleById.get(confirm.roleId)?.key === "owner"
            ? `Make ${confirmName} an owner?`
            : "Change your own role?"
        }
        description={
          confirm?.kind === "role" && roleById.get(confirm.roleId)?.key === "owner"
            ? "Owners have full access to the workspace, including billing, roles and deleting the workspace."
            : "You might lose access to settings you can see right now. This takes effect immediately."
        }
        confirmLabel="Change role"
        onConfirm={async () => {
          if (confirm?.kind !== "role") return
          const res = await changeRole(confirm.member, confirm.roleId)
          return res.ok
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "suspend"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Suspend ${confirmName}?`}
        description="They won't be able to open this workspace until you reactivate them. Their assignments, comments and data stay as they are."
        confirmLabel="Suspend"
        destructive
        onConfirm={async () => {
          if (confirm?.kind !== "suspend") return
          const res = await setMemberStatus(confirm.member, "suspended")
          return res.ok
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "remove"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Remove ${confirmName} from ${orgName}?`}
        description="They lose access immediately and are removed from all teams, inbox access and assignments. Their personal inboxes connected to this workspace — and those conversations — plus their private labels, responses, signatures and rules here are deleted. Shared conversations and comments are kept."
        confirmLabel="Remove member"
        destructive
        confirmText={confirmMember?.email}
        onConfirm={async () => {
          if (confirm?.kind !== "remove") return
          const res = await run(() => removeMemberAction({ slug, userId: confirm.member.userId }), {
            success: `${confirmName} was removed`,
          })
          return res.ok
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "revoke"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Revoke invitation?"
        description={confirm?.kind === "revoke" ? `The invite link sent to ${confirm.invitation.email} will stop working.` : undefined}
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (confirm?.kind !== "revoke") return
          const res = await run(() => revokeInvitationAction({ slug, id: confirm.invitation.id }), { success: "Invitation revoked" })
          return res.ok
        }}
      />

      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite link for {link?.email}</DialogTitle>
            <DialogDescription>
              This new link replaces any earlier link for this invitation and is valid for 14 days.
            </DialogDescription>
          </DialogHeader>
          {link && <CopyField value={link.url} />}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  )
}
