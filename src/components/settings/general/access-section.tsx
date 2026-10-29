"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ColorDot, FormField, SectionFooter, SettingsRow, SettingsRows, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { DomainChips } from "@/components/settings/general/domain-chips"
import { updateWorkspaceAccess } from "@/server/workspace/actions/general"
import { useI18n } from "@/lib/i18n"

type Access = { allowedDomains: string[]; autoJoinDomains: boolean; requireDomainForInvites: boolean; defaultRoleId: string }

export function AccessSection({
  slug,
  initial,
  roles,
  publicDomains,
  verifiedDomains,
  approvalRequired = false,
}: {
  slug: string
  initial: Access
  roles: { id: string; name: string; color: string | null }[]
  publicDomains: string[]
  /** Email domains of admins (approved by the instance admin in SaaS mode) — the only domains usable for auto-join */
  verifiedDomains: string[]
  /** SaaS mode: domains also need the instance administrator's approval */
  approvalRequired?: boolean
}) {
  const { t, locale } = useI18n()
  const it = locale === "it"
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const flagged = useMemo(() => form.allowedDomains.filter((d) => publicDomains.includes(d)), [form.allowedDomains, publicDomains])
  const noDomains = form.allowedDomains.length === 0
  const unverified = form.allowedDomains.filter((d) => !verifiedDomains.includes(d) && !publicDomains.includes(d))

  return (
    <SettingsSection
      title={it ? "Accesso al workspace" : "Joining the workspace"}
      description={it ? "Scegli chi può entrare e quale ruolo ricevono i nuovi membri." : "Control who can join and which role new members get."}
      footer={
        <SectionFooter>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setForm(saved)} disabled={pending}>
              {t("reset")}
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() =>
              run(() => updateWorkspaceAccess({ slug, ...form }), {
                success: t("genAccessSaved"),
                onSuccess: (d) => {
                  const next = { ...form, allowedDomains: d.allowedDomains }
                  setForm(next)
                  setSaved(next)
                },
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            {t("saveChanges")}
          </Button>
        </SectionFooter>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField
          label={it ? "Domini email aziendali" : "Company email domains"}
          htmlFor="domains"
          description={it ? "Inserisci un dominio e premi Invio. Verrà usato per l’accesso automatico e per limitare gli inviti qui sotto." : "Type a domain and press Enter. Used for auto-join and invitation restrictions below."}
        >
          <DomainChips id="domains" value={form.allowedDomains} flagged={flagged} onChange={(allowedDomains) => setForm({ ...form, allowedDomains })} />
        </FormField>
        {flagged.length > 0 && form.autoJoinDomains && (
          <p className="-mt-3 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {(flagged.length === 1 ? t("genPublicDomainOne") : t("genPublicDomainMany"))
              .replace("{domain}", flagged[0] ?? "")
              .replace("{domains}", flagged.join(", "))}
          </p>
        )}
        {unverified.length > 0 && form.autoJoinDomains && (
          <p className="-mt-3 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {t("genUnverifiedDomains").replace("{domains}", unverified.join(", ")).replace(".", "")}
            {approvalRequired ? t("genAdminApproval") : ""}
          </p>
        )}
        <SettingsRows>
          <SettingsRow
            htmlFor="auto-join"
            label={it ? "Accesso automatico tramite dominio email" : "Auto-join by email domain"}
            description={`${t("genNewAccountsJoin")}${approvalRequired ? t("genAdminApproval") : ""}`}
          >
            <Switch
              id="auto-join"
              checked={form.autoJoinDomains}
              disabled={noDomains && !form.autoJoinDomains}
              onCheckedChange={(v) => setForm({ ...form, autoJoinDomains: v })}
            />
          </SettingsRow>
          <SettingsRow
            htmlFor="restrict-invites"
            label={it ? "Invita solo indirizzi aziendali" : "Only invite company addresses"}
            description={it ? "Gli inviti possono essere inviati solo a indirizzi di questi domini." : "Invitations can only be sent to addresses at these domains."}
          >
            <Switch
              id="restrict-invites"
              checked={form.requireDomainForInvites}
              disabled={noDomains && !form.requireDomainForInvites}
              onCheckedChange={(v) => setForm({ ...form, requireDomainForInvites: v })}
            />
          </SettingsRow>
          <SettingsRow htmlFor="default-role" label={it ? "Ruolo predefinito" : "Default role"} description={it ? "Selezionato automaticamente quando inviti qualcuno e usato per l’accesso automatico." : "Pre-selected when inviting and used for auto-join."}>
            <Select value={form.defaultRoleId} onValueChange={(v) => setForm({ ...form, defaultRoleId: v })}>
              <SelectTrigger id="default-role" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <ColorDot color={r.color ?? "#64748b"} />
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsRows>
      </div>
    </SettingsSection>
  )
}
