"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Link2, Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField, SectionFooter, SettingsSection } from "@/components/settings/settings-ui"
import { TimezoneSelect } from "@/components/settings/timezone-select"
import { useServerAction } from "@/components/settings/use-server-action"
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "@/components/settings/personal/image-upload"
import {
  changeWorkspaceSlug,
  setWorkspaceLogoUrl,
  updateWorkspaceProfile,
  uploadWorkspaceLogo,
} from "@/server/workspace/actions/general"

const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,39}$/

export function IdentitySection({
  slug,
  name: initialName,
  timezone: initialTimezone,
  logoUrl,
  appUrl,
  reservedSlugs,
}: {
  slug: string
  name: string
  timezone: string
  logoUrl: string | null
  appUrl: string
  reservedSlugs: string[]
}) {
  const [saved, setSaved] = useState({ name: initialName, timezone: initialTimezone })
  const [form, setForm] = useState(saved)
  const dirty = form.name !== saved.name || form.timezone !== saved.timezone
  const { pending, run, fieldErrors } = useServerAction()

  return (
    <SettingsSection
      title="Workspace"
      description="How your workspace appears to members, in emails and in the workspace switcher."
      footer={
        <SectionFooter hint="Changes are visible to everyone in the workspace.">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setForm(saved)} disabled={pending}>
              Reset
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() =>
              run(() => updateWorkspaceProfile({ slug, ...form }), { success: "Workspace updated", onSuccess: () => setSaved(form) })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </SectionFooter>
      }
    >
      <div className="flex flex-col gap-6">
        <LogoField slug={slug} name={form.name} logoUrl={logoUrl} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Workspace name" htmlFor="ws-name" error={fieldErrors.name}>
            <Input
              id="ws-name"
              value={form.name}
              maxLength={80}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="Timezone" htmlFor="ws-tz" description="Default for members, business hours and analytics.">
            <TimezoneSelect id="ws-tz" className="w-full" value={form.timezone} onChange={(tz) => tz && setForm({ ...form, timezone: tz })} />
          </FormField>
        </div>
        <SlugField slug={slug} appUrl={appUrl} reservedSlugs={reservedSlugs} />
      </div>
    </SettingsSection>
  )
}

function LogoField({ slug, name, logoUrl }: { slug: string; name: string; logoUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState("")
  const { pending, run } = useServerAction()
  const busy = pending || preparing

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    let prepared: File
    try {
      prepared = await prepareImage(file, { size: 256, fit: "contain" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that image.")
      return
    } finally {
      setPreparing(false)
      if (input.current) input.current.value = ""
    }
    await run(() => uploadWorkspaceLogo({ slug, file: prepared }), { success: "Logo updated" })
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-foreground text-xl font-semibold text-background">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided logo (local route or external URL)
          <img src={logoUrl} alt="" className="size-full bg-card object-contain" />
        ) : (
          (name.trim()[0] ?? "W").toUpperCase()
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus /> Upload logo
          </Button>
          <Popover open={urlOpen} onOpenChange={setUrlOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                <Link2 /> Use URL
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-2">
              <form
                className="flex items-center gap-1.5"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const res = await run(() => setWorkspaceLogoUrl({ slug, url: url.trim() }), { success: "Logo updated" })
                  if (res.ok) {
                    setUrl("")
                    setUrlOpen(false)
                  }
                }}
              >
                <Input autoFocus placeholder="https://…/logo.png" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Logo URL" />
                <Button type="submit" size="sm" disabled={!url.trim().startsWith("https://") || pending}>
                  Save
                </Button>
              </form>
            </PopoverContent>
          </Popover>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => run(() => setWorkspaceLogoUrl({ slug, url: null }), { success: "Logo removed" })}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Square logos look best. PNG, JPEG, WebP or GIF.</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload workspace logo"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </div>
  )
}

function SlugField({ slug, appUrl, reservedSlugs }: { slug: string; appUrl: string; reservedSlugs: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(slug)
  const { pending, run } = useServerAction()
  const host = appUrl.replace(/^https?:\/\//, "")
  const clientError = !SLUG_RE.test(value)
    ? "Use 2–40 lowercase letters, numbers and single dashes."
    : reservedSlugs.includes(value)
      ? "This URL is reserved."
      : null

  return (
    <>
      <FormField label="Workspace URL" description="Changing it breaks existing bookmarks and shared links.">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border bg-surface/60 px-2.5 font-mono text-[13px]">
            <span className="truncate text-muted-foreground">{host}/w/</span>
            <span className="truncate font-medium">{slug}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setValue(slug)
              setOpen(true)
            }}
          >
            <Pencil /> Change
          </Button>
        </div>
      </FormField>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change workspace URL</DialogTitle>
            <DialogDescription>
              Members are redirected automatically when they next open Dispatch, but old links and bookmarks stop working.
            </DialogDescription>
          </DialogHeader>
          <form
            id="slug-form"
            className="flex flex-col gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault()
              if (clientError || value === slug) return
              const res = await run(() => changeWorkspaceSlug({ slug, newSlug: value }), { success: "Workspace URL changed" })
              if (res.ok) {
                setOpen(false)
                router.replace(`/w/${res.data.slug}/settings/general`)
              }
            }}
          >
            <label htmlFor="new-slug" className="text-[13px] font-medium">
              New URL
            </label>
            <div className="flex h-8 items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <span className="shrink-0 pl-2.5 font-mono text-[13px] text-muted-foreground">/w/</span>
              <input
                id="new-slug"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                maxLength={40}
                value={value}
                aria-invalid={Boolean(clientError)}
                onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="h-full min-w-0 flex-1 bg-transparent pr-2.5 font-mono text-[13px] outline-none"
              />
            </div>
            <p className={clientError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {clientError ?? `${host}/w/${value}`}
            </p>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="slug-form" disabled={pending || Boolean(clientError) || value === slug}>
              {pending && <Loader2 className="animate-spin" />}
              Change URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
