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
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const { permission, refresh } = useNotificationPermission()
  const set = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = () =>
    run(() => updateNotificationPreferences({ slug, ...form }), {
      success: "Notification settings saved",
      onSuccess: () => setSaved(form),
    })

  const requestPermission = async () => {
    if (permission === "unsupported") return
    const result = await Notification.requestPermission()
    refresh()
    if (result === "granted") {
      set("desktop", true)
      new Notification("Desktop notifications are on", { body: "You'll see new mentions and assignments here.", icon: "/icon.svg" })
    } else if (result === "denied") {
      toast.error("Notifications are blocked. Allow them in your browser's site settings.")
    }
  }

  return (
    <>
      <SettingsSection
        title="Email"
        description={
          <>
            Sent to <span className="font-medium text-foreground">{userEmail}</span> when you&apos;re not active in Dispatch.
          </>
        }
        action={<Switch checked={form.email} onCheckedChange={(v) => set("email", v)} aria-label="Email notifications" />}
      >
        <SettingsRows className={form.email ? undefined : "pointer-events-none opacity-50"}>
          <SettingsRow
            htmlFor="n-mentions"
            label={
              <span className="flex items-center gap-2">
                <AtSign className="size-4 text-muted-foreground" /> Mentions
              </span>
            }
            description="Someone @mentions you in a comment or chat."
          >
            <Switch id="n-mentions" checked={form.mentions} disabled={!form.email} onCheckedChange={(v) => set("mentions", v)} />
          </SettingsRow>
          <SettingsRow
            htmlFor="n-assignments"
            label={
              <span className="flex items-center gap-2">
                <UserCheck className="size-4 text-muted-foreground" /> Assignments
              </span>
            }
            description="A conversation is assigned to you."
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

      <SettingsSection title="New messages" description="Which incoming customer emails should notify you in the app and on desktop.">
        <SettingsRows>
          <SettingsRow
            htmlFor="n-new"
            label={
              <span className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" /> Notify me about
              </span>
            }
          >
            <Select value={form.newMessages} onValueChange={(v) => set("newMessages", v as NotificationPrefs["newMessages"])}>
              <SelectTrigger id="n-new" className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All inboxes I can access</SelectItem>
                <SelectItem value="assigned">Conversations assigned to me</SelectItem>
                <SelectItem value="none">Nothing</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection
        title="Desktop"
        description="Show system notifications while Dispatch is open in a browser tab."
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
                Browser permission
                {permission === "granted" && <StatusBadge tone="success">Allowed</StatusBadge>}
                {permission === "denied" && <StatusBadge tone="danger">Blocked</StatusBadge>}
                {permission === "default" && <StatusBadge tone="neutral">Not requested</StatusBadge>}
                {permission === "unsupported" && <StatusBadge tone="neutral">Not supported</StatusBadge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {permission === "denied"
                  ? "Allow notifications for this site in your browser settings, then reload."
                  : permission === "unsupported"
                    ? "This browser doesn't support desktop notifications."
                    : "Each browser and device asks separately."}
              </p>
            </div>
          </div>
          {permission === "default" && (
            <Button size="sm" variant="outline" onClick={() => void requestPermission()}>
              Allow notifications
            </Button>
          )}
          {permission === "granted" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => new Notification("Test notification", { body: "Desktop notifications work on this device.", icon: "/icon.svg" })}
            >
              Send test
            </Button>
          )}
        </div>
      </SettingsSection>

      <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={() => setForm(saved)} />
    </>
  )
}
