"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Info, Loader2, MailPlus, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MultiCombobox } from "@/components/settings/combobox"
import { copyToClipboard, CopyField } from "@/components/settings/copy-button"
import { ColorDot, FormField } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { parseEmailList } from "@/components/settings/members/parse-emails"
import { inviteMembersAction } from "@/server/workspace/actions/members"
import type { MembersPageData } from "@/server/workspace/queries/members"
import { cn } from "@/lib/utils"

type InviteResult = {
  invited: { id: string; email: string; url: string; delivered: boolean }[]
  skipped: { email: string; reason: string }[]
  emailDelivery: boolean
}

export function InviteDialog({
  slug,
  orgName,
  roles,
  teams,
  defaultRoleId,
  emailDelivery,
}: {
  slug: string
  orgName: string
  roles: MembersPageData["roles"]
  teams: MembersPageData["teams"]
  defaultRoleId: string | null
  emailDelivery: boolean
}) {
  const grantable = roles.filter((r) => r.grantable)
  const initialRole =
    grantable.find((r) => r.id === defaultRoleId)?.id ?? grantable.find((r) => r.key === "member")?.id ?? grantable[0]?.id ?? ""

  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState("")
  const [roleId, setRoleId] = useState(initialRole)
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [result, setResult] = useState<InviteResult | null>(null)
  const { pending, run, fieldErrors } = useServerAction()

  const parsed = useMemo(() => parseEmailList(raw), [raw])
  const role = roles.find((r) => r.id === roleId)

  const reset = () => {
    setRaw("")
    setTeamIds([])
    setRoleId(initialRole)
    setResult(null)
  }

  const submit = () =>
    run(() => inviteMembersAction({ slug, emails: parsed.valid, roleId, teamIds }), {
      onSuccess: (data) => {
        setResult(data)
        if (data.invited.length === 0) return
        setRaw("")
      },
    })

  const unsent = result?.invited.filter((i) => !i.delivered) ?? []
  const sent = result?.invited.filter((i) => i.delivered) ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite people
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite people to {orgName}</DialogTitle>
              <DialogDescription>
                {emailDelivery
                  ? "We'll email each person an invitation that's valid for 14 days."
                  : "You'll get a personal invite link for each person to share."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <FormField
                label="Email addresses"
                htmlFor="invite-emails"
                error={fieldErrors.emails ?? (parsed.invalid.length ? `Not valid: ${parsed.invalid.slice(0, 3).join(", ")}${parsed.invalid.length > 3 ? "…" : ""}` : undefined)}
                description="Separate multiple addresses with commas, spaces or new lines."
              >
                <Textarea
                  id="invite-emails"
                  autoFocus
                  rows={3}
                  value={raw}
                  placeholder="jane@acme.com, sam@acme.com"
                  onChange={(e) => setRaw(e.target.value)}
                  aria-invalid={parsed.invalid.length > 0}
                  className="max-h-40 min-h-20 font-mono text-[13px]"
                />
              </FormField>
              {parsed.valid.length > 0 && (
                <div className="-mt-2 flex flex-wrap gap-1" aria-label="Recipients">
                  {parsed.valid.slice(0, 12).map((e) => (
                    <span key={e} className="rounded-md border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {e}
                    </span>
                  ))}
                  {parsed.valid.length > 12 && (
                    <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{parsed.valid.length - 12} more</span>
                  )}
                </div>
              )}

              <FormField label="Role" htmlFor="invite-role" error={fieldErrors.roleId} description={role?.description ?? undefined}>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id} disabled={!r.grantable}>
                        <ColorDot color={r.color ?? "#64748b"} className="size-2" />
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {teams.length > 0 && (
                <FormField label="Teams" optional htmlFor="invite-teams" description="They'll join these teams when they accept.">
                  <MultiCombobox
                    id="invite-teams"
                    options={teams.map((t) => ({ value: t.id, label: t.name, icon: <ColorDot color={t.color} className="size-2" /> }))}
                    value={teamIds}
                    onChange={setTeamIds}
                    placeholder="No teams"
                    searchPlaceholder="Search teams…"
                  />
                </FormField>
              )}

              {!emailDelivery && (
                <div className="flex gap-2 rounded-lg border bg-surface/60 p-3 text-[13px] text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Email delivery isn&apos;t configured on this instance, so no emails are sent. Copy the links after creating
                    the invitations.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending || parsed.valid.length === 0 || !roleId}>
                {pending ? <Loader2 className="animate-spin" /> : <MailPlus />}
                {parsed.valid.length > 1
                  ? `${emailDelivery ? "Send" : "Create"} ${parsed.valid.length} invitations`
                  : emailDelivery
                    ? "Send invitation"
                    : "Create invitation"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.invited.length > 0 && <CheckCircle2 className="size-4 text-success" />}
                {result.invited.length === 0
                  ? "Nobody was invited"
                  : `${result.invited.length} ${result.invited.length === 1 ? "invitation" : "invitations"} created`}
              </DialogTitle>
              <DialogDescription>
                {sent.length > 0 && `${sent.length} ${sent.length === 1 ? "email" : "emails"} sent. `}
                {unsent.length > 0 && "Share these links with the people you invited — each link works once and expires in 14 days."}
              </DialogDescription>
            </DialogHeader>

            {unsent.length > 0 && (
              <div className="flex flex-col gap-2">
                {unsent.map((i) => (
                  <div key={i.id} className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium">{i.email}</span>
                    <CopyField value={i.url} />
                  </div>
                ))}
                {unsent.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => copyToClipboard(unsent.map((i) => `${i.email}: ${i.url}`).join("\n"), "All links copied")}
                  >
                    Copy all links
                  </Button>
                )}
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2 text-[13px] font-medium">Skipped</div>
                <ul className="divide-y text-[13px]">
                  {result.skipped.map((s) => (
                    <li key={s.email} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="truncate font-mono text-[12px]">{s.email}</span>
                      <span className={cn("text-xs text-muted-foreground sm:text-right")}>{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>
                Invite more
              </Button>
              <Button
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
