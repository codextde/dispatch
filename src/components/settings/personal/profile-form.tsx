"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, Palmtree, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/app/user-avatar"
import {
  FormField,
  SaveBar,
  SectionFooter,
  SettingsSection,
  StatusBadge,
} from "@/components/settings/settings-ui"
import { TimezoneSelect } from "@/components/settings/timezone-select"
import { useServerAction } from "@/components/settings/use-server-action"
import { LocalTime, useBrowserTimeZone, useHydrated } from "@/components/app/local-time"
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "@/components/settings/personal/image-upload"
import { removeAvatar, updateAway, updateProfile, uploadAvatar } from "@/server/workspace/actions/personal"

type Profile = {
  name: string
  email: string
  title: string
  timezone: string | null
  avatarUrl: string | null
  awayUntil: string | null
  awayMessage: string
  /** awayUntil lies in the future (computed on the server) */
  away: boolean
}

/** "2026-09-27T14:30" in the browser's local time */
function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultAwayUntil() {
  const d = new Date(Date.now() + 7 * 86_400_000)
  d.setHours(9, 0, 0, 0)
  return toLocalInput(d.toISOString())
}

export function ProfileForm({ slug, profile, workspaceTimezone }: { slug: string; profile: Profile; workspaceTimezone: string }) {
  const [saved, setSaved] = useState({ name: profile.name, title: profile.title, timezone: profile.timezone })
  const [form, setForm] = useState(saved)
  const dirty = form.name !== saved.name || form.title !== saved.title || form.timezone !== saved.timezone
  const { pending, run, fieldErrors } = useServerAction()
  const deviceTimezone = useBrowserTimeZone()

  const save = () =>
    run(() => updateProfile({ slug, ...form }), {
      success: "Profile saved",
      onSuccess: () => setSaved(form),
    })

  return (
    <>
      <SettingsSection title="Your profile" description="Your name, photo and title are shown to teammates in this workspace.">
        <div className="flex flex-col gap-6">
          <AvatarField slug={slug} name={form.name} email={profile.email} avatarUrl={profile.avatarUrl} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name" htmlFor="name" error={fieldErrors.name}>
              <Input
                id="name"
                autoComplete="name"
                value={form.name}
                aria-invalid={Boolean(fieldErrors.name)}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Email" htmlFor="email" description="Used to sign in. Contact an admin to change it.">
              <Input id="email" value={profile.email} readOnly disabled />
            </FormField>
            <FormField
              label="Job title"
              htmlFor="title"
              optional
              error={fieldErrors.title}
              description="Only for this workspace — used in signatures as {{user.title}}."
            >
              <Input
                id="title"
                placeholder="e.g. Customer Success"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <FormField label="Timezone" htmlFor="timezone" description={`Workspace default: ${workspaceTimezone.replace(/_/g, " ")}`}>
              <TimezoneSelect
                id="timezone"
                className="w-full"
                value={form.timezone}
                allowEmpty
                emptyLabel="Use workspace default"
                onChange={(tz) => setForm({ ...form, timezone: tz })}
              />
            </FormField>
          </div>
          {!form.timezone && deviceTimezone && (
            <button
              type="button"
              className="-mt-3 w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setForm({ ...form, timezone: deviceTimezone })}
            >
              Use my device&apos;s timezone ({deviceTimezone.replace(/_/g, " ")})
            </button>
          )}
        </div>
      </SettingsSection>

      <OutOfOffice slug={slug} active={profile.away} awayUntil={profile.awayUntil} awayMessage={profile.awayMessage} />

      <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={() => setForm(saved)} />
    </>
  )
}

function AvatarField({ slug, name, email, avatarUrl }: { slug: string; name: string; email: string; avatarUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const { pending, run } = useServerAction()
  const busy = pending || preparing

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    let prepared: File
    try {
      prepared = await prepareImage(file, { size: 256, fit: "cover" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that image.")
      return
    } finally {
      setPreparing(false)
      if (input.current) input.current.value = ""
    }
    await run(() => uploadAvatar({ slug, file: prepared }), { success: "Photo updated" })
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar name={name} email={email} src={avatarUrl} className="size-16 text-lg" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Camera /> {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => run(() => removeAvatar({ slug }), { success: "Photo removed" })}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Square images work best. PNG, JPEG, WebP or GIF.</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload profile photo"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  )
}

function OutOfOffice({
  slug,
  active,
  awayUntil,
  awayMessage,
}: {
  slug: string
  active: boolean
  awayUntil: string | null
  awayMessage: string
}) {
  const [enabled, setEnabled] = useState(active)
  const [until, setUntil] = useState(() => (active ? toLocalInput(awayUntil) : defaultAwayUntil()))
  const [message, setMessage] = useState(active ? awayMessage : "")
  const { pending, run, fieldErrors } = useServerAction()
  const hydrated = useHydrated()

  const save = () => {
    if (enabled && !until) return toast.error("Pick until when you're away.")
    run(
      () =>
        updateAway({
          slug,
          awayUntil: enabled ? new Date(until).toISOString() : null,
          awayMessage: enabled ? message : "",
        }),
      { success: enabled ? "Out of office is on" : "Out of office turned off" }
    )
  }

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          Out of office
          {active && (
            <StatusBadge tone="warning">
              Away until <LocalTime date={awayUntil} />
            </StatusBadge>
          )}
        </span>
      }
      description="Teammates see that you're away, and automatic team assignment skips you."
      action={<Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Out of office" />}
      footer={
        <SectionFooter
          hint={
            <span className="flex items-center gap-1.5">
              <Palmtree className="size-3.5" />
              Turns off automatically when the date passes.
            </span>
          }
        >
          {(enabled || active) && (
            <Button size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {enabled ? "Save" : "Turn off"}
            </Button>
          )}
        </SectionFooter>
      }
    >
      {enabled ? (
        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <FormField label="Away until" htmlFor="away-until" error={fieldErrors.awayUntil}>
            <Input
              id="away-until"
              type="datetime-local"
              value={until}
              min={hydrated ? toLocalInput(new Date().toISOString()) : undefined}
              onChange={(e) => setUntil(e.target.value)}
            />
          </FormField>
          <FormField label="Message for teammates" htmlFor="away-message" optional error={fieldErrors.awayMessage}>
            <Textarea
              id="away-message"
              rows={3}
              maxLength={500}
              placeholder="e.g. On vacation — Maya covers billing questions."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </FormField>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">You&apos;re available.</p>
      )}
    </SettingsSection>
  )
}
