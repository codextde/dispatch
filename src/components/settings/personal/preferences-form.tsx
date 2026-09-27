"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Keyboard, Monitor, Moon, Sun } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Kbd } from "@/components/ui/kbd"
import { SaveBar, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { OptionCards } from "@/components/settings/personal/option-cards"
import { useServerAction } from "@/components/settings/use-server-action"
import { updatePreferences } from "@/server/workspace/actions/personal"
import { cn } from "@/lib/utils"

export type PreferencesValue = {
  theme: "light" | "dark" | "system"
  density: "comfortable" | "compact"
  shortcuts: "dispatch" | "gmail" | "off"
  sendAndArchive: boolean
  undoSendSeconds: number | null
  loadRemoteImages: "always" | "ask" | "never"
}

function ThemePreview({ mode }: { mode: "light" | "dark" | "system" }) {
  const pane = (dark: boolean, className?: string) => (
    <div className={cn("flex h-full flex-1 gap-1 p-1.5", dark ? "bg-[#1f1f1f]" : "bg-[#FAF9F5]", className)}>
      <div className={cn("w-1/4 rounded-[3px]", dark ? "bg-[#2a2a2a]" : "bg-[#efede8]")} />
      <div className="flex flex-1 flex-col gap-1">
        <div className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-[#3a3a3a]" : "bg-[#e3e0da]")} />
        <div className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-[#3a3a3a]" : "bg-[#e3e0da]")} />
        <div className="mt-auto h-1.5 w-1/3 rounded-full bg-[oklch(0.7_0.17_152)]" />
      </div>
    </div>
  )
  return (
    <div className="flex h-16 overflow-hidden rounded-md border" aria-hidden>
      {mode === "light" && pane(false)}
      {mode === "dark" && pane(true)}
      {mode === "system" && (
        <>
          {pane(false)}
          {pane(true)}
        </>
      )}
    </div>
  )
}

export function PreferencesForm({
  slug,
  initial,
  workspaceUndoSeconds,
  instanceRemoteImages,
}: {
  slug: string
  initial: PreferencesValue
  workspaceUndoSeconds: number
  instanceRemoteImages: "always" | "ask" | "never"
}) {
  const { setTheme } = useTheme()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const set = <K extends keyof PreferencesValue>(k: K, v: PreferencesValue[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = () =>
    run(() => updatePreferences({ slug, ...form }), {
      success: "Preferences saved",
      onSuccess: () => setSaved(form),
    })

  const reset = () => {
    setForm(saved)
    setTheme(saved.theme)
  }

  return (
    <>
      <SettingsSection title="Appearance" description="Theme and density apply to this device right away and follow you everywhere once saved.">
        <div className="flex flex-col gap-6">
          <OptionCards
            label="Theme"
            value={form.theme}
            onChange={(v) => {
              set("theme", v)
              setTheme(v)
            }}
            options={[
              { value: "light", label: "Light", icon: <Sun />, preview: <ThemePreview mode="light" /> },
              { value: "dark", label: "Dark", icon: <Moon />, preview: <ThemePreview mode="dark" /> },
              { value: "system", label: "System", icon: <Monitor />, preview: <ThemePreview mode="system" /> },
            ]}
          />
          <OptionCards
            label="Density"
            columns={2}
            value={form.density}
            onChange={(v) => set("density", v)}
            options={[
              { value: "comfortable", label: "Comfortable", description: "Two-line previews with more breathing room." },
              { value: "compact", label: "Compact", description: "Single-line rows — see more conversations at once." },
            ]}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Sending & reading">
        <SettingsRows>
          <SettingsRow
            label="Undo send"
            description="Delay outgoing emails so you can cancel them. Scheduled messages aren't affected."
            htmlFor="undo-send"
          >
            <Select
              value={form.undoSendSeconds === null ? "default" : String(form.undoSendSeconds)}
              onValueChange={(v) => set("undoSendSeconds", v === "default" ? null : Number(v))}
            >
              <SelectTrigger id="undo-send" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Workspace default ({workspaceUndoSeconds ? `${workspaceUndoSeconds}s` : "off"})</SelectItem>
                <SelectItem value="0">Off</SelectItem>
                {[5, 10, 15, 20, 30].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} seconds
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="Send & archive"
            description="Close the conversation when you send a reply, so your inbox stays clear."
            htmlFor="send-archive"
          >
            <Switch id="send-archive" checked={form.sendAndArchive} onCheckedChange={(v) => set("sendAndArchive", v)} />
          </SettingsRow>
          <SettingsRow
            label="Remote images"
            htmlFor="remote-images"
            description={
              instanceRemoteImages === "never"
                ? "Your administrator blocks remote images in emails on this instance."
                : "Remote images can reveal when and where you opened an email (tracking pixels)."
            }
          >
            <Select
              value={instanceRemoteImages === "never" ? "never" : form.loadRemoteImages}
              disabled={instanceRemoteImages === "never"}
              onValueChange={(v) => set("loadRemoteImages", v as PreferencesValue["loadRemoteImages"])}
            >
              <SelectTrigger id="remote-images" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always load</SelectItem>
                <SelectItem value="ask">Ask for each email</SelectItem>
                <SelectItem value="never">Never load</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection title="Keyboard shortcuts" description="Fly through your inbox without touching the mouse.">
        <OptionCards
          label="Keyboard shortcuts"
          value={form.shortcuts}
          onChange={(v) => set("shortcuts", v)}
          options={[
            {
              value: "dispatch",
              label: "Dispatch",
              icon: <Keyboard />,
              description: "Single keys — N to compose, / to search, G then I for the inbox.",
            },
            { value: "gmail", label: "Gmail-style", icon: <Keyboard />, description: "Key bindings familiar from Gmail." },
            { value: "off", label: "Off", description: "Only standard browser shortcuts." },
          ]}
        />
        {form.shortcuts !== "off" && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            Press <Kbd>?</Kbd> anywhere in the inbox to see all shortcuts.
          </p>
        )}
      </SettingsSection>

      <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={reset} />
    </>
  )
}
