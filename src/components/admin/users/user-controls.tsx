"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Ban, CircleCheck, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone, Trash2, UserCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useAdminAction } from "@/components/admin/client"
import { LocalTime } from "@/components/app/local-time"
import { StatusBadge } from "@/components/admin/ui"
import {
  deleteUserAction,
  revokeAllUserSessionsAction,
  revokeUserSessionAction,
  setSuperAdminAction,
  setUserStatusAction,
} from "@/app/admin/users/actions"
import { useI18n } from "@/lib/i18n"

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
  const { t } = useI18n()
  if (isSuperAdmin) {
    return (
      <div className="grid gap-1.5">
        <ConfirmButton
          disabled={Boolean(blockedReason)}
          title={t("usrRevokeSuperTitle")}
          description={t("usrRevokeSuperDesc").replace("{email}", email)}
          confirmLabel={t("usrRevokeAccess")}
          destructive
          action={() => setSuperAdminAction({ id, value: false })}
          success={t("usrSuperRevoked")}
          className="w-full justify-start"
        >
          <ShieldOff /> {t("usrRevokeSuper")}
        </ConfirmButton>
        {blockedReason && <Blocked>{blockedReason}</Blocked>}
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <ConfirmButton
        disabled={Boolean(blockedReason)}
        title={t("usrGrantSuperTitle")}
        description={
          <>
            <strong className="text-foreground">{email}</strong> {t("usrGrantSuperDesc")}
          </>
        }
        confirmLabel={t("usrGrantAccess")}
        action={() => setSuperAdminAction({ id, value: true })}
        success={t("usrSuperGranted")}
        className="w-full justify-start"
      >
        <ShieldCheck /> {t("usrMakeSuper")}
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
  const { t } = useI18n()
  if (status === "disabled") {
    return (
      <ConfirmButton
        title={t("usrEnableTitle")}
        description={`${email} ${t("usrCanSignIn")}`}
        confirmLabel={t("usrEnableAccount")}
        action={() => setUserStatusAction({ id, status: "active" })}
        success={t("usrEnabled")}
        className="w-full justify-start"
      >
        <CircleCheck /> {t("usrEnableAccount")}
      </ConfirmButton>
    )
  }
  return (
    <div className="grid gap-1.5">
      <ConfirmButton
        disabled={Boolean(blockedReason)}
        destructive
        title={t("usrDisableTitle")}
        description={`${email} ${t("usrDisableDesc")}`}
        confirmLabel={t("usrDisableAccount")}
        action={() => setUserStatusAction({ id, status: "disabled" })}
        success={t("usrDisabled")}
        className="w-full justify-start"
      >
        <Ban /> {t("usrDisableAccount")}
      </ConfirmButton>
      {blockedReason && <Blocked>{blockedReason}</Blocked>}
    </div>
  )
}

export type SessionItem = {
  id: string
  deviceLabel: string
  ip: string | null
  createdAt: string
  lastUsedAt: string
  impersonation: boolean
  current: boolean
  mobile: boolean
}

export function SessionsList({ userId, sessions, isSelf }: { userId: string; sessions: SessionItem[]; isSelf: boolean }) {
  const revoke = useAdminAction()
  const { t } = useI18n()
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
                      {t("usrThisDevice")}
                    </StatusBadge>
                  )}
                  {s.impersonation && (
                    <StatusBadge tone="warn" dot={false} className="h-4 px-1.5 text-[10px]">
                      {t("usrImpersonation")}
                    </StatusBadge>
                  )}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {s.ip ?? t("usrUnknownIp")} · {t("usrActive")} <LocalTime date={s.lastUsedAt} format="relative" titleFormat="datetime" /> · {t("usrSignedIn")} {" "}
                  <LocalTime date={s.createdAt} format="relative" titleFormat="datetime" />
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.pending}
                  aria-label={`${t("usrRevokeSession")} ${s.deviceLabel}`}
                  onClick={() => revoke.run(() => revokeUserSessionAction({ userId, sessionId: s.id }), { success: t("usrSessionRevoked") })}
                >
                  <LogOut /> <span className="hidden sm:inline">{t("usrRevokeSession")}</span>
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
            title={isSelf ? t("usrOtherDevicesTitle") : t("usrRevokeAllTitle")}
            description={
              isSelf
                ? t("usrOtherDevicesDesc")
                : t("usrRevokeAllDesc")
            }
            confirmLabel={t("usrRevokeSessions")}
            action={() => revokeAllUserSessionsAction({ userId })}
            success={t("usrSessionRevoked")}
          >
            <LogOut /> {isSelf ? t("usrSignOutOther") : t("usrRevokeAll")}
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
  const { t } = useI18n()
  return (
    <div className="grid gap-2">
      <ConfirmButton
        destructive
        disabled={Boolean(blockedReason)}
        title={t("usrDeleteTitle").replace("{email}", email)}
        description={t("usrDeleteDesc")}
        confirmText={email}
        confirmLabel={t("usrDeleteUser")}
        action={() => deleteUserAction({ id, confirm: email })}
        success={t("usrDeleted")}
        onSuccess={() => router.push("/admin/users")}
        className="w-full justify-start sm:w-auto"
      >
        <Trash2 /> {t("usrDeleteUser")}
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
