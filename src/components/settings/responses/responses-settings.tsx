"use client"

import { useMemo, useState } from "react"
import { Copy, Globe, MessageSquareText, MoreHorizontal, Pencil, Plus, Search, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import { fromNow, pluralize } from "@/components/settings/format"
import { Code, EmptyState, SettingsPage, SettingsSection } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { deleteResponse } from "@/server/workspace/actions/responses"
import { ResponseEditor, type ResponseDraft, type ResponseScope, type TeamOption } from "./response-editor"
import { htmlSnippet } from "./text"

export type ResponseItem = {
  id: string
  name: string
  subject: string | null
  shortcut: string | null
  body: string
  scope: ResponseScope
  teamId: string | null
  usageCount: number
  updatedAt: Date
  editable: boolean
}

type Filter = "all" | ResponseScope

function ScopeBadge({ item, teams }: { item: ResponseItem; teams: Map<string, TeamOption> }) {
  if (item.scope === "personal") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <User className="size-3" /> Personal
      </span>
    )
  }
  if (item.scope === "team") {
    const team = item.teamId ? teams.get(item.teamId) : undefined
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team?.color ?? "var(--subtle)" }} aria-hidden />
        <span className="truncate">{team?.name ?? "Team"}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Globe className="size-3" /> Workspace
    </span>
  )
}

export function ResponsesSettings({
  slug,
  responses,
  teams,
  canManageShared,
}: {
  slug: string
  responses: ResponseItem[]
  teams: TeamOption[]
  canManageShared: boolean
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [editing, setEditing] = useState<ResponseDraft | null>(null)
  const [deleting, setDeleting] = useState<ResponseItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { run } = useServerAction()
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])

  const counts = useMemo(() => {
    const c = { all: responses.length, personal: 0, team: 0, workspace: 0 }
    for (const r of responses) c[r.scope]++
    return c
  }, [responses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\//, "")
    return responses.filter((r) => {
      if (filter !== "all" && r.scope !== filter) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.shortcut ?? "").includes(q) ||
        (r.subject ?? "").toLowerCase().includes(q) ||
        htmlSnippet(r.body, 2000).toLowerCase().includes(q)
      )
    })
  }, [responses, filter, query])

  const newDraft = (): ResponseDraft => ({
    name: "",
    subject: "",
    shortcut: "",
    body: "",
    scope: filter === "team" || filter === "workspace" ? (canManageShared ? filter : "personal") : "personal",
    teamId: filter === "team" && canManageShared ? (teams[0]?.id ?? null) : null,
  })

  const toDraft = (r: ResponseItem): ResponseDraft => ({
    id: r.id,
    name: r.name,
    subject: r.subject ?? "",
    shortcut: r.shortcut ?? "",
    body: r.body,
    scope: r.scope,
    teamId: r.teamId,
  })

  const duplicate = (r: ResponseItem) =>
    setEditing({
      ...toDraft(r),
      id: undefined,
      name: `${r.name} (copy)`.slice(0, 80),
      shortcut: "",
      scope: r.editable ? r.scope : "personal",
      teamId: r.editable ? r.teamId : null,
    })

  return (
    <SettingsPage
      eyebrow="Productivity"
      title="Canned responses"
      quiet="for answers you send often"
      description="Save replies once and insert them from the composer. Variables like {{contact.first_name}} are filled in automatically."
      width="wide"
      actions={
        <Button onClick={() => setEditing(newDraft())}>
          <Plus /> New response
        </Button>
      }
    >
      <SettingsSection flush className="pt-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search responses"
              placeholder="Search by name, shortcut or text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="w-full sm:w-fit">
              {(
                [
                  ["all", "All"],
                  ["personal", "Personal"],
                  ["team", "Team"],
                  ["workspace", "Workspace"],
                ] as const
              ).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="px-2.5 text-[13px]">
                  {label}
                  <span className="text-[11px] text-muted-foreground tabular-nums">{counts[value]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<MessageSquareText />}
              title={responses.length === 0 ? "No canned responses yet" : "No matching responses"}
              description={
                responses.length === 0
                  ? "Create replies for common questions — refunds, onboarding, bug reports — and send them in two keystrokes."
                  : "Try a different search or filter."
              }
            >
              {responses.length === 0 && (
                <Button size="sm" onClick={() => setEditing(newDraft())}>
                  <Plus /> Create a response
                </Button>
              )}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y" aria-label="Canned responses">
            {filtered.map((r) => (
              <li key={r.id} className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                  onClick={() => (r.editable ? setEditing(toDraft(r)) : duplicate(r))}
                  aria-label={r.editable ? `Edit ${r.name}` : `Duplicate ${r.name} as a personal response`}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {r.shortcut && <Code className="px-1 py-0 text-[11px]">/{r.shortcut}</Code>}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                    {r.subject && <span className="text-foreground/80">{r.subject} — </span>}
                    {htmlSnippet(r.body)}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ScopeBadge item={r} teams={teamMap} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.usageCount > 0 ? `Used ${pluralize(r.usageCount, "time")}` : "Not used yet"}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">Updated {fromNow(r.updatedAt)}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`} className="relative z-10 shrink-0 text-muted-foreground">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {r.editable && (
                      <DropdownMenuItem onClick={() => setEditing(toDraft(r))}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => duplicate(r)}>
                      <Copy /> {r.editable ? "Duplicate" : "Duplicate as personal"}
                    </DropdownMenuItem>
                    {r.editable && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleting(r)
                            setDeleteOpen(true)
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {editing && (
        <ResponseEditor
          key={editing.id ?? `new-${editing.name}`}
          slug={slug}
          draft={editing}
          teams={teams}
          canManageShared={canManageShared}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.scope === "personal"
            ? "This personal response will be removed. This can't be undone."
            : "Teammates won't be able to insert it anymore. This can't be undone."
        }
        confirmLabel="Delete response"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          const res = await run(() => deleteResponse({ slug, id: deleting.id }), { success: "Response deleted" })
          return res.ok
        }}
      />
    </SettingsPage>
  )
}
