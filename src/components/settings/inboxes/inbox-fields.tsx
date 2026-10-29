"use client"

import { ColorDot, FormField, SettingsRow, SettingsRows } from "@/components/settings/settings-ui"
import { ColorPicker } from "@/components/settings/color-picker"
import { Combobox } from "@/components/settings/combobox"
import { EmailChips } from "@/components/settings/inboxes/email-chips"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SYNC_DAY_OPTIONS, type SyncDays, type TeamOpt } from "@/components/settings/inboxes/types"
import { useI18n } from "@/lib/i18n"

export type InboxSettingsDraft = {
  name: string
  color: string
  teamId: string | null
  fromName: string
  syncDays: SyncDays
  aliases: string[]
  autoCc: string[]
  autoBcc: string[]
  saveSentCopy: boolean
  markReadOnServer: boolean
}

export function toSyncDays(n: number | undefined | null): SyncDays {
  return (SYNC_DAY_OPTIONS as number[]).includes(n ?? -1) ? (n as SyncDays) : 30
}

type Props = {
  value: InboxSettingsDraft
  onChange: (value: InboxSettingsDraft) => void
  errors?: Record<string, string>
}

/** Name, color, team and sender name. */
export function IdentityFields({
  value,
  onChange,
  errors = {},
  teams,
  showTeam,
  fromNamePlaceholder,
}: Props & { teams: TeamOpt[]; showTeam: boolean; fromNamePlaceholder?: string }) {
  const { t, locale } = useI18n()
  const it = locale === "it"
  const set = (patch: Partial<InboxSettingsDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={it ? "Nome casella" : "Inbox name"} htmlFor="inbox-name" error={errors["name"] ?? errors["settings.name"]} description={it ? "Visualizzato nella barra laterale." : "Shown in the sidebar."}>
        <div className="flex items-center gap-2">
          <ColorPicker value={value.color} onChange={(color) => set({ color })} label={it ? "Colore casella" : "Inbox color"} />
          <Input
            id="inbox-name"
            value={value.name}
            maxLength={80}
            placeholder={t("inboxSupportPlaceholder")}
            aria-invalid={Boolean(errors["name"] ?? errors["settings.name"]) || undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
      </FormField>
      <FormField label={it ? "Nome mittente" : "Sender name"} htmlFor="inbox-from-name" optional description={it ? "I destinatari vedranno questo nome nelle risposte." : "Recipients see this name on replies."}>
        <Input
          id="inbox-from-name"
          value={value.fromName}
          maxLength={120}
          placeholder={fromNamePlaceholder || t("inboxFromNamePlaceholder")}
          onChange={(e) => set({ fromName: e.target.value })}
        />
      </FormField>
      {showTeam && (
        <FormField label={it ? "Team" : "Team"} htmlFor="inbox-team" optional description={it ? "Raggruppa la casella sotto un team nella barra laterale." : "Groups the inbox under a team in the sidebar."}>
          <Combobox
            id="inbox-team"
            options={teams.map((t) => ({ value: t.id, label: t.name, icon: <ColorDot color={t.color} /> }))}
            value={value.teamId}
            onChange={(teamId) => set({ teamId })}
            placeholder={teams.length ? t("inboxNoTeam") : t("inboxNoTeams")}
            disabled={!teams.length}
            clearable
            searchPlaceholder={t("inboxSearchTeams")}
          />
        </FormField>
      )}
    </div>
  )
}

export function SyncDaysField({ value, onChange }: { value: SyncDays; onChange: (v: SyncDays) => void }) {
  const { t } = useI18n()
  const labels: Record<SyncDays, string> = { 7: t("inbox7Days"), 30: t("inbox30Days"), 90: t("inbox90Days"), 365: t("inbox1Year") }
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={String(value)}
      onValueChange={(v) => v && onChange(Number(v) as SyncDays)}
      aria-label={t("inboxSyncHistory")}
      className="w-full sm:w-auto"
    >
      {SYNC_DAY_OPTIONS.map((d) => (
        <ToggleGroupItem key={d} value={String(d)} className="flex-1 px-3 text-[13px] sm:flex-none">
          {labels[d]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Aliases, automatic CC/BCC and server-side behaviour switches. */
export function SendingFields({ value, onChange, errors = {} }: Props) {
  const { t, locale } = useI18n()
  const it = locale === "it"
  const set = (patch: Partial<InboxSettingsDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-5">
      <FormField
        label={it ? "Alias" : "Aliases"}
        htmlFor="inbox-aliases"
        optional
        error={errors["aliases"] ?? errors["settings.aliases"]}
        description={it ? "Altri indirizzi che recapitano in questa casella e da cui puoi anche inviare." : "Other addresses delivered to this mailbox that you can also send from."}
      >
        <EmailChips id="inbox-aliases" value={value.aliases} onChange={(aliases) => set({ aliases })} placeholder={t("inboxSalesPlaceholder")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={it ? "CC automatico" : "Always CC"} htmlFor="inbox-cc" optional error={errors["autoCc"] ?? errors["settings.autoCc"]}>
          <EmailChips id="inbox-cc" value={value.autoCc} onChange={(autoCc) => set({ autoCc })} />
        </FormField>
        <FormField label={it ? "CCN automatico" : "Always BCC"} htmlFor="inbox-bcc" optional error={errors["autoBcc"] ?? errors["settings.autoBcc"]}>
          <EmailChips id="inbox-bcc" value={value.autoBcc} onChange={(autoBcc) => set({ autoBcc })} placeholder={t("inboxCrmPlaceholder")} />
        </FormField>
      </div>
      <SettingsRows className="rounded-lg border px-4 py-3">
        <SettingsRow
          label={it ? "Salva una copia delle email inviate" : "Save a copy of sent emails"}
          htmlFor="inbox-save-sent"
          description={it ? "Carica le risposte nella cartella Inviati. Disattiva per Gmail e Microsoft 365, che salvano automaticamente la posta inviata." : "Upload replies to the Sent folder. Turn off for Gmail and Microsoft 365, which save sent mail automatically."}
          className="py-3"
        >
          <Switch id="inbox-save-sent" checked={value.saveSentCopy} onCheckedChange={(saveSentCopy) => set({ saveSentCopy })} />
        </SettingsRow>
        <SettingsRow
          label={it ? "Segna come letta sul server di posta" : "Mark as read on the mail server"}
          htmlFor="inbox-mark-read"
          description={it ? "Quando leggi una conversazione in Dispatch, segnala come letta anche nella casella." : "When a conversation is read in Dispatch, also mark it read in the mailbox."}
          className="py-3"
        >
          <Switch
            id="inbox-mark-read"
            checked={value.markReadOnServer}
            onCheckedChange={(markReadOnServer) => set({ markReadOnServer })}
          />
        </SettingsRow>
      </SettingsRows>
    </div>
  )
}
