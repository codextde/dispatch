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

type Access = { allowedDomains: string[]; autoJoinDomains: boolean; requireDomainForInvites: boolean; defaultRoleId: string }

export function AccessSection({
  slug,
  initial,
  roles,
  publicDomains,
  verifiedDomains,
}: {
  slug: string
  initial: Access
  roles: { id: string; name: string; color: string | null }[]
  publicDomains: string[]
  /** Email domains of admins — the only domains usable for auto-join */
  verifiedDomains: string[]
}) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const { pending, run } = useServerAction()
  const flagged = useMemo(() => form.allowedDomains.filter((d) => publicDomains.includes(d)), [form.allowedDomains, publicDomains])
  const noDomains = form.allowedDomains.length === 0
  const unverified = form.allowedDomains.filter((d) => !verifiedDomains.includes(d) && !publicDomains.includes(d))

  return (
    <SettingsSection
      title="Joining the workspace"
      description="Control who can join and which role new members get."
      footer={
        <SectionFooter>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setForm(saved)} disabled={pending}>
              Reset
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() =>
              run(() => updateWorkspaceAccess({ slug, ...form }), {
                success: "Access settings saved",
                onSuccess: (d) => {
                  const next = { ...form, allowedDomains: d.allowedDomains }
                  setForm(next)
                  setSaved(next)
                },
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </SectionFooter>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField
          label="Company email domains"
          htmlFor="domains"
          description="Type a domain and press Enter. Used for auto-join and invitation restrictions below."
        >
          <DomainChips id="domains" value={form.allowedDomains} flagged={flagged} onChange={(allowedDomains) => setForm({ ...form, allowedDomains })} />
        </FormField>
        {flagged.length > 0 && form.autoJoinDomains && (
          <p className="-mt-3 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {flagged.join(", ")} {flagged.length === 1 ? "is a public email provider" : "are public email providers"} — auto-join would let
            anyone in. Remove {flagged.length === 1 ? "it" : "them"} or turn auto-join off.
          </p>
        )}
        {unverified.length > 0 && form.autoJoinDomains && (
          <p className="-mt-3 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_45%)]">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            Auto-join only works for domains where a workspace admin has an email address — {unverified.join(", ")}{" "}
            {unverified.length === 1 ? "isn't" : "aren't"} verified.
          </p>
        )}
        <SettingsRows>
          <SettingsRow
            htmlFor="auto-join"
            label="Auto-join by email domain"
            description="People who sign in with an address at these domains join automatically with the default role. Only domains of your admins' own addresses qualify."
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
            label="Only invite company addresses"
            description="Invitations can only be sent to addresses at these domains."
          >
            <Switch
              id="restrict-invites"
              checked={form.requireDomainForInvites}
              disabled={noDomains && !form.requireDomainForInvites}
              onCheckedChange={(v) => setForm({ ...form, requireDomainForInvites: v })}
            />
          </SettingsRow>
          <SettingsRow htmlFor="default-role" label="Default role" description="Pre-selected when inviting and used for auto-join.">
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
