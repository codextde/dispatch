"use client"

import { Laptop, LogOut, Monitor, ShieldAlert, Smartphone, Tablet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { signOut } from "@/components/app/user-menu"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { EmptyState, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { LocalTime } from "@/components/app/local-time"
import { auditActionLabel, auditActionTone } from "@/components/settings/audit/action-labels"
import { revokeDevice, revokeOtherDevices } from "@/server/workspace/actions/personal"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type Device = {
  id: string
  deviceLabel: string
  ip: string | null
  createdAt: Date
  lastUsedAt: Date
  expiresAt: Date
  current: boolean
  impersonated: boolean
}

export type SignInEvent = {
  id: string
  action: string
  ip: string | null
  device: string | null
  createdAt: Date
}

function DeviceIcon({ label, className }: { label: string; className?: string }) {
  const l = label.toLowerCase()
  const Icon = l.includes("phone") || l.includes("ios") || l.includes("android")
    ? Smartphone
    : l.includes("tablet") || l.includes("ipad")
      ? Tablet
      : l.includes("script") || l.includes("unknown")
        ? Monitor
        : Laptop
  return <Icon className={className} />
}

export function SecurityPanel({ slug, devices, activity }: { slug: string; devices: Device[]; activity: SignInEvent[] }) {
  const { t } = useI18n()
  const { pending, run } = useServerAction()
  const others = devices.filter((d) => !d.current)

  return (
    <>
      <SettingsSection
        title={t("secDevicesTitle")}
        description={t("secDevicesDescription")}
        flush
        action={
          others.length > 0 && (
            <ConfirmDialog
              title={t("secSignOutOthersTitle")}
              description={others.length === 1 ? t("secOneOtherSession") : t("secManyOtherSessions")}
              confirmLabel={t("secSignOutOthers")}
              destructive
              onConfirm={async () => {
                const res = await run(() => revokeOtherDevices({ slug }), { success: t("secSignedOutOthers") })
                return res.ok
              }}
              trigger={
                <Button size="sm" variant="outline">
                  <LogOut /> {t("secSignOutOthers")}
                </Button>
              }
            />
          )
        }
      >
        <ul className="divide-y border-t">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-muted-foreground",
                    d.current && "border-brand/40 bg-brand-soft text-foreground"
                  )}
                >
                  <DeviceIcon label={d.deviceLabel} className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    <span className="truncate">{d.deviceLabel}</span>
                    {d.current && <StatusBadge tone="success">{t("secThisDevice")}</StatusBadge>}
                    {d.impersonated && <StatusBadge tone="warning">{t("secAdminImpersonation")}</StatusBadge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {d.ip && <span className="font-mono">{d.ip}</span>}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{d.current ? t("secActiveNow") : <><>{t("secLastActive")} </><LocalTime date={d.lastUsedAt} format="relative" /></>}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("secLastActive")} <LocalTime date={d.lastUsedAt} />
                      </TooltipContent>
                    </Tooltip>
                    <span>
                      {t("secSignedIn")} <LocalTime date={d.createdAt} format="date" />
                    </span>
                  </div>
                </div>
              </div>
              {d.current ? (
                <Button size="sm" variant="ghost" className="self-start sm:self-auto" onClick={signOut}>
                  {t("secSignOut")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start sm:self-auto"
                  disabled={pending}
                  onClick={() => run(() => revokeDevice({ slug, sessionId: d.id }), { success: t("secDeviceSignedOut") })}
                >
                  {t("secSignOut")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection
        title={t("secRecentActivity")}
        description={t("secRecentActivityDescription")}
        flush={activity.length > 0}
      >
        {activity.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert />}
            title={t("secNoActivity")}
            description={t("secActivityDescription")}
          />
        ) : (
          <ul className="divide-y border-t">
            {activity.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusBadge tone={auditActionTone(e.action) === "danger" ? "danger" : e.action === "auth.login" ? "success" : "neutral"}>
                    {auditActionLabel(e.action)}
                  </StatusBadge>
                  <span className="truncate text-[13px] text-muted-foreground">{e.device ?? t("secUnknownDevice")}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <LocalTime date={e.createdAt} format="relative" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <LocalTime date={e.createdAt} />
                    </TooltipContent>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  )
}
