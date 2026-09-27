"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Ban, CircleCheck, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone, Trash2, UserCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useAdminAction } from "@/components/admin/client"
import { StatusBadge } from "@/components/admin/ui"
import {
  deleteUserAction,
  revokeAllUserSessionsAction,
  revokeUserSessionAction,
  setSuperAdminAction,
  setUserStatusAction,
} from "@/app/admin/users/actions"

function Blocked({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

export function SuperAdminControl({
  id,
  email,
  isSuperAdmin,
  blockedReason,
}: {
  id: string
  email: string
  isSuperAdmin: boolean
  blockedReason: string | null
}) {
  if (isSuperAdmin) {
    return (
      <div className="grid gap-1.5">
        <ConfirmButton
          disabled={Boolean(blockedReason)}
          title="Revoke super admin access?"
          description={`${email} will lose access to the instance admin panel. Their workspace memberships are not affected.`}
          confirmLabel="Revoke access"
          destructive
          action={() => setSuperAdminAction({ id, value: false })}
          success="Super admin access revoked"
          className="w-full justify-start"
        >
          <ShieldOff /> Revoke super admin
        </ConfirmButton>
        {blockedReason && <Blocked>{blockedReason}</Blocked>}
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <ConfirmButton
        disabled={Boolean(blockedReason)}
        title="Grant super admin access?"
        description={
          <>
            <strong className="text-foreground">{email}</strong> will be able to see every workspace and user, change instance settings, and
            impersonate other people. Only grant this to people who operate the instance.
          </>
        }
        confirmLabel="Grant access"
        action={() => setSuperAdminAction({ id, value: true })}
        success="Super admin access granted"
        className="w-full justify-start"
      >
        <ShieldCheck /> Make super admin
      </ConfirmButton>
      {blockedReason && <Blocked>{blockedReason}</Blocked>}
    </div>
  )
}

export function AccountStatusControl({
  id,
  email,
  status,
  blockedReason,
}: {
  id: string
  email: string
  status: "active" | "disabled"
  blockedReason: string | null
}) {
  if (status === "disabled") {
    return (
      <ConfirmButton
        title="Enable this account?"
        description={`${email} will be able to sign in again.`}
        confirmLabel="Enable account"
        action={() => setUserStatusAction({ id, status: "active" })}
        success="Account enabled"
        className="w-full justify-start"
      >
        <CircleCheck /> Enable account
      </ConfirmButton>
    )
  }
  return (
    <div className="grid gap-1.5">
      <ConfirmButton
        disabled={Boolean(blockedReason)}
        destructive
        title="Disable this account?"
        description={`${email} is signed out on every device immediately and can't sign in until you enable the account again. Their data stays intact.`}
        confirmLabel="Disable account"
        action={() => setUserStatusAction({ id, status: "disabled" })}
        success="Account disabled"
        className="w-full justify-start"
      >
        <Ban /> Disable account
      </ConfirmButton>
      {blockedReason && <Blocked>{blockedReason}</Blocked>}
    </div>
  )
}

export type SessionItem = {
  id: string
  deviceLabel: string
  ip: string | null
  created: string
  lastUsed: string
  impersonation: boolean
  current: boolean
  mobile: boolean
}

export function SessionsList({ userId, sessions, isSelf }: { userId: string; sessions: SessionItem[]; isSelf: boolean }) {
  const revoke = useAdminAction()
  const revocable = sessions.filter((s) => !s.current)
  return (
    <div>
      <ul className="divide-y divide-border">
        {sessions.map((s) => {
          const Icon = s.mobile ? Smartphone : Monitor
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.deviceLabel}</span>
                  {s.current && (
                    <StatusBadge tone="ok" dot={false} className="h-4 px-1.5 text-[10px]">
                      This device
                    </StatusBadge>
                  )}
                  {s.impersonation && (
                    <StatusBadge tone="warn" dot={false} className="h-4 px-1.5 text-[10px]">
                      Impersonation
                    </StatusBadge>
                  )}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {s.ip ?? "Unknown IP"} · active {s.lastUsed} · signed in {s.created}
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.pending}
                  aria-label={`Revoke session on ${s.deviceLabel}`}
                  onClick={() => revoke.run(() => revokeUserSessionAction({ userId, sessionId: s.id }), { success: "Session revoked" })}
                >
                  <LogOut /> <span className="hidden sm:inline">Revoke</span>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {revocable.length > 1 && (
        <div className="flex justify-end border-t border-border px-4 py-3 md:px-5">
          <ConfirmButton
            destructive
            title={isSelf ? "Sign out your other devices?" : "Revoke all sessions?"}
            description={
              isSelf
                ? "Every other device is signed out. This device stays signed in."
                : "The user is signed out everywhere and has to sign in again with a new link or code."
            }
            confirmLabel="Revoke sessions"
            action={() => revokeAllUserSessionsAction({ userId })}
            success="Sessions revoked"
          >
            <LogOut /> {isSelf ? "Sign out other devices" : "Revoke all"}
          </ConfirmButton>
        </div>
      )}
    </div>
  )
}

export function DeleteUserControl({
  id,
  email,
  blockedReason,
  soleOwned,
}: {
  id: string
  email: string
  blockedReason: string | null
  soleOwned: { id: string; name: string }[]
}) {
  const router = useRouter()
  return (
    <div className="grid gap-2">
      <ConfirmButton
        destructive
        disabled={Boolean(blockedReason)}
        title={`Delete ${email}?`}
        description="The account, its sessions, memberships, personal inboxes, private labels and personal contacts are deleted permanently. Messages and comments they wrote stay in their workspaces."
        confirmText={email}
        confirmLabel="Delete user"
        action={() => deleteUserAction({ id, confirm: email })}
        success="User deleted"
        onSuccess={() => router.push("/admin/users")}
        className="w-full justify-start sm:w-auto"
      >
        <Trash2 /> Delete user
      </ConfirmButton>
      {blockedReason && (
        <div className="text-xs text-muted-foreground">
          {blockedReason}
          {soleOwned.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {soleOwned.map((w) => (
                <li key={w.id}>
                  <Link href={`/admin/workspaces/${w.id}`} className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline">
                    <UserCog className="size-3" /> {w.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
