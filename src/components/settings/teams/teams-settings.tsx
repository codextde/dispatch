"use client"

import { useMemo, useState } from "react"
import { Crown, Inbox, Loader2, MessageSquare, Plus, Trash2, UserPlus, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { MultiCombobox } from "@/components/settings/combobox"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { randomPresetColor } from "@/components/settings/color-picker"
import { EmptyState, FormField, MicroLabel, SettingsPage, StatusBadge } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { STRATEGY_INFO, TeamFields, type TeamDraft } from "@/components/settings/teams/team-fields"
import {
  addTeamMembersAction,
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
  setTeamLeadAction,
  updateTeamAction,
} from "@/server/workspace/actions/teams"
import type { TeamRow, TeamsPageData } from "@/server/workspace/queries/teams"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

type MemberOptions = TeamsPageData["memberOptions"]

function memberComboOptions(options: MemberOptions, exclude: Set<string>) {
  return options
    .filter((m) => !exclude.has(m.userId))
    .map((m) => ({
      value: m.userId,
      label: m.name || m.email,
      hint: m.name ? m.email : undefined,
      icon: <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />,
    }))
}

function AvatarStack({ members, max = 5, emptyLabel }: { members: TeamRow["members"]; max?: number; emptyLabel: string }) {
  if (!members.length) return <span className="text-xs text-muted-foreground">{emptyLabel}</span>
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {members.slice(0, max).map((m) => (
          <UserAvatar key={m.userId} name={m.name} email={m.email} src={m.avatarUrl} size="sm" className="ring-2 ring-card" />
        ))}
      </div>
      {members.length > max && <span className="ml-1.5 text-xs text-muted-foreground">+{members.length - max}</span>}
    </div>
  )
}

export function TeamsSettings({ slug, data }: { slug: string; data: TeamsPageData }) {
  const { t, locale } = useI18n()
  const { teams, memberOptions } = data
  const [createOpen, setCreateOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = teams.find((t) => t.id === activeId) ?? null

  return (
    <SettingsPage
      eyebrow="Workspace"
      title={locale === "it" ? "Team" : "Teams"}
      quiet={t("teamTagline")}
      description={t("teamDescription")}
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> {t("teamNew")}
        </Button>
      }
    >
      {teams.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t("teamEmptyTitle")}
          description={t("teamEmptyDescription")}
        >
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> {t("teamCreateFirst")}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => {
            const info = STRATEGY_INFO[team.assignmentStrategy]
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setActiveId(team.id)}
                className="group flex flex-col gap-4 rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ring-1 ring-black/10 ring-inset"
                    style={{ backgroundColor: team.color }}
                    aria-hidden
                  >
                    {team.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold tracking-tight">{team.name}</div>
                    <p className="line-clamp-2 text-[13px] text-muted-foreground">
                      {team.description || `${team.members.length} ${team.members.length === 1 ? t("memMemberCount") : t("memMembersCount")}`}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <AvatarStack members={team.members} emptyLabel={t("teamNoMembers")} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {team.inboxCount > 0 && (
                      <span className="inline-flex items-center gap-1" title={`${team.inboxCount} ${t("inboxes").toLowerCase()}`}>
                        <Inbox className="size-3.5" /> {team.inboxCount}
                      </span>
                    )}
                    {team.openConversations > 0 && (
                      <span className="inline-flex items-center gap-1" title={t("teamOpenConversations").replace("{count}", String(team.openConversations))}>
                        <MessageSquare className="size-3.5" /> {team.openConversations}
                      </span>
                    )}
                    <StatusBadge tone={team.assignmentStrategy === "none" ? "neutral" : "info"}>{t(info.label as Parameters<typeof t>[0])}</StatusBadge>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <CreateTeamDialog slug={slug} open={createOpen} onOpenChange={setCreateOpen} memberOptions={memberOptions} onCreated={setActiveId} />
      <TeamSheet slug={slug} team={active} memberOptions={memberOptions} onClose={() => setActiveId(null)} />
    </SettingsPage>
  )
}

const emptyDraft = (): TeamDraft => ({ name: "", description: "", color: randomPresetColor(), assignmentStrategy: "none" })

function CreateTeamDialog({
  slug,
  open,
  onOpenChange,
  memberOptions,
  onCreated,
}: {
  slug: string
  open: boolean
  onOpenChange: (o: boolean) => void
  memberOptions: MemberOptions
  onCreated: (id: string) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<TeamDraft>(emptyDraft)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const { pending, run, fieldErrors, setFieldErrors } = useServerAction()

  const submit = () => {
    if (!draft.name.trim()) {
      setFieldErrors({ name: "Name is required" })
      return
    }
    void run(() => createTeamAction({ slug, ...draft, memberIds, leadIds: [] }), {
      success: t("teamCreated").replace("{name}", draft.name.trim()),
      onSuccess: (d) => {
        onOpenChange(false)
        setDraft(emptyDraft())
        setMemberIds([])
        onCreated(d.id)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        onOpenChange(o)
        if (!o) setFieldErrors({})
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("teamNew")}</DialogTitle>
          <DialogDescription>{t("teamDialogDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <TeamFields idPrefix="new-team" value={draft} onChange={setDraft} errors={fieldErrors} />
          <FormField label={t("teamMembers")} optional htmlFor="new-team-members">
            <MultiCombobox
              id="new-team-members"
              options={memberComboOptions(memberOptions, new Set())}
              value={memberIds}
              onChange={setMemberIds}
              placeholder={t("teamAddPeople")}
              searchPlaceholder={t("teamSearchPeople")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {t("teamCreate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TeamSheet({
  slug,
  team,
  memberOptions,
  onClose,
}: {
  slug: string
  team: TeamRow | null
  memberOptions: MemberOptions
  onClose: () => void
}) {
  return (
    <Sheet open={!!team} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        {team && <TeamSheetBody key={team.id} slug={slug} team={team} memberOptions={memberOptions} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

const draftOf = (team: TeamRow): TeamDraft => ({
  name: team.name,
  description: team.description ?? "",
  color: team.color,
  assignmentStrategy: team.assignmentStrategy,
})

function TeamSheetBody({
  slug,
  team,
  memberOptions,
  onClose,
}: {
  slug: string
  team: TeamRow
  memberOptions: MemberOptions
  onClose: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<TeamDraft>(() => draftOf(team))
  const [toAdd, setToAdd] = useState<string[]>([])
  const save = useServerAction()
  const members = useServerAction()

  const memberSet = useMemo(() => new Set(team.members.map((m) => m.userId)), [team])
  const dirty =
    draft.name !== team.name ||
    draft.description !== (team.description ?? "") ||
    draft.color !== team.color ||
    draft.assignmentStrategy !== team.assignmentStrategy

  return (
    <>
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <SheetTitle className="flex items-center gap-2">
          <span className="size-3 rounded-full ring-1 ring-black/10 ring-inset" style={{ backgroundColor: draft.color }} />
          {team.name}
        </SheetTitle>
        <SheetDescription>
          {team.members.length} {team.members.length === 1 ? t("memMemberCount") : t("memMembersCount")}
          {team.inboxCount > 0 && ` · ${team.inboxCount} ${t("inboxes").toLowerCase()}`}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b px-5 py-5">
          <MicroLabel className="mb-3 block">{t("teamDetails")}</MicroLabel>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void save.run(() => updateTeamAction({ slug, id: team.id, ...draft }), { success: t("teamSaved") })
            }}
          >
            <TeamFields idPrefix={`team-${team.id}`} value={draft} onChange={setDraft} errors={save.fieldErrors} />
            <div className="flex justify-end gap-2">
              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDraft(draftOf(team))}
                >
                  {t("reset")}
                </Button>
              )}
              <Button type="submit" disabled={!dirty || save.pending}>
                {save.pending && <Loader2 className="animate-spin" />}
                {t("teamSaveChanges")}
              </Button>
            </div>
          </form>
        </section>

        <section className="border-b px-5 py-5">
          <MicroLabel className="mb-3 block">{t("teamMembers")}</MicroLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <MultiCombobox
              options={memberComboOptions(memberOptions, memberSet)}
              value={toAdd}
              onChange={setToAdd}
              placeholder={t("teamAddPeople")}
              searchPlaceholder={t("teamSearchPeople")}
              emptyText={t("teamAlreadyMembers")}
              className="flex-1"
            />
            <Button
              variant="outline"
              disabled={!toAdd.length || members.pending}
              onClick={() =>
                void members.run(() => addTeamMembersAction({ slug, teamId: team.id, userIds: toAdd }), {
                  success: (d) => t("teamAddedCount").replace("{count}", String(d.added)).replace("{members}", d.added === 1 ? t("memMemberCount") : t("memMembersCount")),
                  onSuccess: () => setToAdd([]),
                })
              }
            >
              <UserPlus /> {t("teamAdd")}
            </Button>
          </div>

          {team.members.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed px-3 py-6 text-center text-[13px] text-muted-foreground">
              {t("teamEmptyMembers")}
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border">
              {team.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                  <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                      {m.name || m.email}
                      {m.isLead && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-warning/15 px-1 text-[10px] font-medium text-[color-mix(in_oklch,var(--warning),var(--foreground)_50%)]">
                          <Crown className="size-2.5" /> {t("teamLead")}
                        </span>
                      )}
                      {m.status === "suspended" && <StatusBadge tone="warning">{t("teamSuspended")}</StatusBadge>}
                    </div>
                    {m.name && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-pressed={m.isLead}
                        aria-label={m.isLead ? `${t("teamRemoveLead")} ${m.name || m.email}` : `${t("teamMakeLead")} ${m.name || m.email}`}
                        disabled={members.pending}
                        className={cn(m.isLead ? "text-warning" : "text-muted-foreground")}
                        onClick={() =>
                          void members.run(() => setTeamLeadAction({ slug, teamId: team.id, userId: m.userId, isLead: !m.isLead }))
                        }
                      >
                        <Crown />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{m.isLead ? t("teamRemoveLead") : t("teamMakeLead")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("teamRemoveFromTeam")} ${m.name || m.email}`}
                        disabled={members.pending}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          void members.run(() => removeTeamMemberAction({ slug, teamId: team.id, userId: m.userId }), {
                            success: t("teamMemberRemoved").replace("{name}", m.name || m.email).replace("{team}", team.name),
                          })
                        }
                      >
                        <X />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("teamRemoveFromTeam")}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-5 py-5">
          <MicroLabel className="mb-3 block text-destructive/80">{t("teamDanger")}</MicroLabel>
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted-foreground">
              {t("teamDeleteDescription")}
            </p>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" className="shrink-0">
                  <Trash2 /> {t("teamDelete")}
                </Button>
              }
              title={`Delete “${team.name}”?`}
              description={t("teamDeleteConfirmation")}
              confirmLabel={t("teamDelete")}
              destructive
              onConfirm={async () => {
                const res = await members.run(() => deleteTeamAction({ slug, id: team.id }), { success: t("teamDeleted") })
                if (res.ok) onClose()
                return res.ok
              }}
            />
          </div>
        </section>
      </div>
    </>
  )
}
