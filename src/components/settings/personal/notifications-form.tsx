"use client"

import { useState, useSyncExternalStore } from "react"
import { AtSign, BellRing, Mail, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { SaveBar, SettingsRow, SettingsRows, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { updateNotificationPreferences } from "@/server/workspace/actions/personal"
import { useI18n } from "@/lib/i18n"

export type NotificationPrefs = {
  email: boolean
  desktop: boolean
  mentions: boolean
  assignments: boolean
  newMessages: "all" | "assigned" | "none"
}

type PermissionState = NotificationPermission | "unsupported"

function readPermission(): PermissionState {
  return typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission
}

/** Browser notification permission, kept in sync when it changes. */
function useNotificationPermission() {
  const [tick, setTick] = useState(0)
  const permission = useSyncExternalStore(
    (cb) => {
      let status: PermissionStatus | null = null
      navigator.permissions
        ?.query({ name: "notifications" as PermissionName })
        .then((s) => {
          status = s
          s.onchange = cb
        })
        .catch(() => {})
      return () => {
        if (status) status.onchange = null
      }
    },
    readPermission,
    () => "default" as PermissionState
  )
  return { permission, refresh: () => setTick(tick + 1) }
}

export function NotificationsForm({ slug, initial, userEmail }: { slug: string; initial: NotificationPrefs; userEmail: string }) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const { permission, refresh } = useNotificationPermission()
  const set = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = () =>
    run(() => updateNotificationPreferences({ slug, ...form }), {
      success: t("notificationSettingsSaved"),
      onSuccess: () => setSaved(form),
    })

  const requestPermission = async () => {
    if (permission === "unsupported") return
    const result = await Notification.requestPermission()
    refresh()
    if (result === "granted") {
      set("desktop", true)
      new Notification(t("desktopNotificationsOn"), { body: t("desktopNotificationHelp"), icon: "/icon.svg" })
    } else if (result === "denied") {
      toast.error(t("notificationsBlocked"))
    }
  }

  return (
    <>
      <SettingsSection
        title={t("emailSettings")}
        description={
          <>
            {t("sentWhenInactive")} <span className="font-medium text-foreground">{userEmail}</span> {t("whenInactive")}
          </>
        }
            action={<Switch checked={form.email} onCheckedChange={(v) => set("email", v)} aria-label={t("emailNotifications")} />}
      >
        <SettingsRows className={form.email ? undefined : "pointer-events-none opacity-50"}>
          <SettingsRow
            htmlFor="n-mentions"
            label={
              <span className="flex items-center gap-2">
                <AtSign className="size-4 text-muted-foreground" /> {t("mentionsSetting")}
              </span>
            }
            description={t("mentionDescription")}
          >
            <Switch id="n-mentions" checked={form.mentions} disabled={!form.email} onCheckedChange={(v) => set("mentions", v)} />
          </SettingsRow>
          <SettingsRow
            htmlFor="n-assignments"
            label={
              <span className="flex items-center gap-2">
                <UserCheck className="size-4 text-muted-foreground" /> {t("assignmentsSetting")}
              </span>
            }
            description={t("assignmentDescription")}
          >
            <Switch
              id="n-assignments"
              checked={form.assignments}
              disabled={!form.email}
              onCheckedChange={(v) => set("assignments", v)}
            />
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection title={t("newMessages")} description={t("newMessagesDescription")}>
        <SettingsRows>
          <SettingsRow
            htmlFor="n-new"
            label={
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" /> {t("notifyMeAbout")}
              </span>
            }
          >
            <Select value={form.newMessages} onValueChange={(v) => set("newMessages", v as NotificationPrefs["newMessages"])}>
              <SelectTrigger id="n-new" className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allAccessibleInboxes")}</SelectItem>
                <SelectItem value="assigned">{t("assignedConversations")}</SelectItem>
                <SelectItem value="none">{t("nothing")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection
        title={t("desktop")}
        description={t("desktopDescription")}
        action={
          <Switch
            checked={form.desktop}
            onCheckedChange={(v) => {
              set("desktop", v)
              // Turning desktop notifications on asks for the browser permission first
              if (v && permission === "default") void requestPermission()
            }}
            disabled={permission === "unsupported" || permission === "denied"}
            aria-label="Desktop notifications"
          />
        }
      >
        <div className="flex flex-col gap-3 rounded-lg border bg-surface/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BellRing className="size-4 shrink-0 text-muted-foreground" />
            <div className="text-[13px]">
              <div className="flex items-center gap-2 font-medium">
                {t("browserPermission")}
                {permission === "granted" && <StatusBadge tone="success">{t("allowed")}</StatusBadge>}
                {permission === "denied" && <StatusBadge tone="danger">{t("blocked")}</StatusBadge>}
                {permission === "default" && <StatusBadge tone="neutral">{t("notRequested")}</StatusBadge>}
                {permission === "unsupported" && <StatusBadge tone="neutral">{t("notSupported")}</StatusBadge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {permission === "denied"
                  ? t("allowSiteNotifications")
                  : permission === "unsupported"
                    ? t("browserNoNotifications")
                    : t("browsersAskSeparately")}
              </p>
            </div>
          </div>
          {permission === "default" && (
            <Button size="sm" variant="outline" onClick={() => void requestPermission()}>
              {t("allowNotifications")}
            </Button>
          )}
          {permission === "granted" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => new Notification(t("testNotification"), { body: t("desktopWorks"), icon: "/icon.svg" })}
            >
              {t("sendTest")}
            </Button>
          )}
        </div>
      </SettingsSection>

      <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={() => setForm(saved)} />
    </>
  )
}
