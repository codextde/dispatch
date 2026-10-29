"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Keyboard, Languages, Monitor, Moon, Sun } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Kbd } from "@/components/ui/kbd"
import { SaveBar, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { OptionCards } from "@/components/settings/personal/option-cards"
import { useServerAction } from "@/components/settings/use-server-action"
import { updatePreferences } from "@/server/workspace/actions/personal"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type PreferencesValue = {
  theme: "light" | "dark" | "system"
  density: "comfortable" | "compact"
  shortcuts: "dispatch" | "gmail" | "off"
  sendAndArchive: boolean
  undoSendSeconds: number | null
  loadRemoteImages: "always" | "ask" | "never"
  locale: "en" | "it"
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
  const { t } = useI18n()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const set = <K extends keyof PreferencesValue>(k: K, v: PreferencesValue[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = () =>
    run(() => updatePreferences({ slug, ...form }), {
      success: t("prefSaved"),
      onSuccess: () => setSaved(form),
    })

  const reset = () => {
    setForm(saved)
    setTheme(saved.theme)
  }

  return (
    <>
      <SettingsSection title={t("appearance")} description={t("prefAppearanceDescription")}>
        <div className="flex flex-col gap-6">
          <OptionCards
            label={t("theme")}
            value={form.theme}
            onChange={(v) => {
              set("theme", v)
              setTheme(v)
            }}
            options={[
              { value: "light", label: t("light"), icon: <Sun />, preview: <ThemePreview mode="light" /> },
              { value: "dark", label: t("dark"), icon: <Moon />, preview: <ThemePreview mode="dark" /> },
              { value: "system", label: t("system"), icon: <Monitor />, preview: <ThemePreview mode="system" /> },
            ]}
          />
          <OptionCards
            label={t("density")}
            columns={2}
            value={form.density}
            onChange={(v) => set("density", v)}
            options={[
              { value: "comfortable", label: t("comfortable"), description: t("prefComfortableDescription") },
              { value: "compact", label: t("compact"), description: t("prefCompactDescription") },
            ]}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t("language")} description={t("languageHelp")}>
        <OptionCards
          label={t("prefLanguageLabel")}
          value={form.locale}
          onChange={(v) => set("locale", v)}
          options={[
            { value: "en", label: "English", icon: <Languages /> },
            { value: "it", label: "Italiano", icon: <Languages /> },
          ]}
        />
      </SettingsSection>

      <SettingsSection title={t("sendingReading")}>
        <SettingsRows>
          <SettingsRow
            label={t("undoSend")}
            description={t("prefUndoSendDescription")}
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
                <SelectItem value="default">{t("defaultWorkspace")} ({workspaceUndoSeconds ? `${workspaceUndoSeconds}s` : t("off")})</SelectItem>
                <SelectItem value="0">{t("off")}</SelectItem>
                {[5, 10, 15, 20, 30].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} {t("seconds")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label={t("sendArchive")}
            description={t("prefSendArchiveDescription")}
            htmlFor="send-archive"
          >
            <Switch id="send-archive" checked={form.sendAndArchive} onCheckedChange={(v) => set("sendAndArchive", v)} />
          </SettingsRow>
          <SettingsRow
            label={t("remoteImages")}
            htmlFor="remote-images"
            description={
              instanceRemoteImages === "never"
                ? t("prefRemoteImagesBlocked")
                : t("prefRemoteImagesDescription")
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
                <SelectItem value="always">{t("prefAlwaysLoad")}</SelectItem>
                <SelectItem value="ask">{t("prefAskEachEmail")}</SelectItem>
                <SelectItem value="never">{t("prefNeverLoad")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>

      <SettingsSection title={t("keyboardShortcuts")} description={t("prefKeyboardDescription")}>
        <OptionCards
          label={t("keyboardShortcuts")}
          value={form.shortcuts}
          onChange={(v) => set("shortcuts", v)}
          options={[
            {
              value: "dispatch",
              label: "Dispatch",
              icon: <Keyboard />,
              description: t("prefDispatchKeys"),
            },
            { value: "gmail", label: "Gmail", icon: <Keyboard />, description: t("prefGmailKeys") },
            { value: "off", label: t("off"), description: t("prefOffKeys") },
          ]}
        />
        {form.shortcuts !== "off" && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("prefPressHelp")} <Kbd>?</Kbd> {t("prefShortcutHint")}
          </p>
        )}
      </SettingsSection>

      <SaveBar dirty={dirty} pending={pending} onSave={save} onReset={reset} />
    </>
  )
}
