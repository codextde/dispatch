"use client"

import { useMemo } from "react"
import { Globe, Lock, Trash2, Users } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { ColorDot } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AccessLevel, AccessValue, MemberOpt, TeamOpt } from "@/components/settings/inboxes/types"

export const ACCESS_LEVELS: { value: AccessLevel; label: string; description: string }[] = [
  { value: "read", label: "Read only", description: "See conversations and comment internally" },
  { value: "reply", label: "Read & reply", description: "Also send emails from this inbox" },
  { value: "manage", label: "Manage", description: "Also change inbox settings and access" },
]

export function describeAccess(value: AccessValue) {
  if (value.mode === "everyone") return "Everyone who can view all shared inboxes"
  const teams = value.grants.filter((g) => g.kind === "team").length
  const users = value.grants.filter((g) => g.kind === "user").length
  const parts = [teams && `${teams} team${teams === 1 ? "" : "s"}`, users && `${users} ${users === 1 ? "person" : "people"}`].filter(Boolean)
  return parts.join(" · ") || "Nobody yet"
}

function ModeCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-foreground/30 bg-surface ring-1 ring-foreground/10"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
          selected && "border-brand/40 bg-brand-soft text-foreground"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] text-pretty text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-input",
          selected && "border-primary bg-primary"
        )}
      >
        {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
      </span>
    </button>
  )
}

/** Choose who can access a shared inbox: everyone with view-all, or specific teams/people with a level. */
export function AccessEditor({
  value,
  onChange,
  teams,
  members,
}: {
  value: AccessValue
  onChange: (value: AccessValue) => void
  teams: TeamOpt[]
  members: MemberOpt[]
}) {
  const taken = useMemo(() => new Set(value.grants.map((g) => `${g.kind}:${g.id}`)), [value.grants])
  const options: ComboOption[] = useMemo(
    () => [
      ...teams
        .filter((t) => !taken.has(`team:${t.id}`))
        .map((t) => ({ value: `team:${t.id}`, label: t.name, group: "Teams", icon: <ColorDot color={t.color} /> })),
      ...members
        .filter((m) => !taken.has(`user:${m.userId}`))
        .map((m) => ({
          value: `user:${m.userId}`,
          label: m.name || m.email,
          hint: m.name ? m.email : undefined,
          group: "People",
          icon: <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />,
        })),
    ],
    [teams, members, taken]
  )

  const setLevel = (idx: number, level: AccessLevel) =>
    onChange({ ...value, grants: value.grants.map((g, i) => (i === idx ? { ...g, level } : g)) })

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Who can access this inbox" className="grid gap-2">
        <ModeCard
          selected={value.mode === "everyone"}
          onSelect={() => onChange({ ...value, mode: "everyone" })}
          icon={<Globe className="size-3.5" />}
          title="Everyone with access to all shared inboxes"
          description="Members whose role includes “View all shared inboxes” can read and reply. People who manage inboxes always have access."
        />
        <ModeCard
          selected={value.mode === "specific"}
          onSelect={() => onChange({ ...value, mode: "specific" })}
          icon={<Lock className="size-3.5" />}
          title="Specific teams and people"
          description="Grant access to selected teams and teammates, each with their own access level."
        />
      </div>

      {value.mode === "specific" && (
        <div className="flex flex-col gap-2.5">
          <Combobox
            options={options}
            value={null}
            onChange={(v) => {
              if (!v) return
              const [kind, id] = v.split(":") as ["team" | "user", string]
              onChange({ ...value, grants: [...value.grants, { kind, id, level: "reply" }] })
            }}
            placeholder="Add a team or person…"
            searchPlaceholder="Search teams and people…"
            emptyText={teams.length + members.length ? "Everyone is already added." : "No teams or members yet."}
          />
          {value.grants.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-[13px] text-muted-foreground">
              <Users className="size-4 shrink-0" />
              Add at least one team or person who should work in this inbox.
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {value.grants.map((g, idx) => {
                const team = g.kind === "team" ? teams.find((t) => t.id === g.id) : undefined
                const member = g.kind === "user" ? members.find((m) => m.userId === g.id) : undefined
                const label = team?.name ?? member?.name ?? member?.email ?? "Removed"
                return (
                  <li key={`${g.kind}:${g.id}`} className="flex items-center gap-2.5 px-3 py-2">
                    {team ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-surface">
                        <ColorDot color={team.color} />
                      </span>
                    ) : (
                      <UserAvatar name={member?.name} email={member?.email} src={member?.avatarUrl} size="sm" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {team ? "Team" : member?.name ? member.email : "Member"}
                      </span>
                    </span>
                    <Select value={g.level} onValueChange={(v) => setLevel(idx, v as AccessLevel)}>
                      <SelectTrigger size="sm" className="w-[8.5rem]" aria-label={`Access level for ${label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {ACCESS_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            <span className="flex flex-col">
                              <span>{l.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${label}`}
                      onClick={() => onChange({ ...value, grants: value.grants.filter((_, i) => i !== idx) })}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Read only: see conversations and comment · Read &amp; reply: also send email · Manage: also edit this inbox.
          </p>
        </div>
      )}
    </div>
  )
}
