"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import {
  CalendarDays,
  Check,
  CheckCheck,
  Columns3,
  CornerDownLeft,
  List,
  ListTodo,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/app/user-avatar"
import { cn } from "@/lib/utils"
import { AreaTopBar } from "./area-top-bar"
import { parseQuickAdd } from "./quick-add"
import { AssigneeAvatar, formatDue } from "./task-fields"
import { TaskBoardView } from "./task-board-view"
import { TaskDetailSheet } from "./task-detail-sheet"
import { TaskListView, type GroupBy } from "./task-list-view"
import { useTaskMutations, useTaskOptions, useTaskRealtime, useTasks, type TaskDto, type TaskPatch, type TaskQuery } from "./use-tasks"

type Scope = "mine" | "all" | "unassigned" | `user:${string}`
type View = "list" | "board"

type Prefs = { view: View; groupBy: GroupBy; showDone: boolean; scope: Scope }
const DEFAULT_PREFS: Prefs = { view: "list", groupBy: "due", showDone: false, scope: "mine" }
const PREFS_KEY = "dispatch:tasks:prefs"

// View preferences live in localStorage (per browser), with an in-memory fallback
let memoryPrefs = ""
const prefsListeners = new Set<() => void>()
function subscribePrefs(cb: () => void) {
  prefsListeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    prefsListeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}
function readPrefsRaw() {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? memoryPrefs
  } catch {
    return memoryPrefs
  }
}
function writePrefs(prefs: Prefs) {
  memoryPrefs = JSON.stringify(prefs)
  try {
    window.localStorage.setItem(PREFS_KEY, memoryPrefs)
  } catch {
    /* storage unavailable: keep in memory */
  }
  for (const l of prefsListeners) l()
}
function parsePrefs(raw: string | null): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<Prefs>) : {}) }
  } catch {
    return DEFAULT_PREFS
  }
}

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))
}

export function TasksView() {
  const { org, user } = useOrg()
  const slug = org.slug
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const rawPrefs = useSyncExternalStore(subscribePrefs, readPrefsRaw, () => null)
  const hydrated = rawPrefs !== null
  const prefs = useMemo(() => parsePrefs(rawPrefs), [rawPrefs])
  const { view, groupBy, showDone, scope } = prefs
  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => writePrefs({ ...parsePrefs(readPrefsRaw()), [key]: value }), [])
  const setView = (v: View) => setPref("view", v)
  const setGroupBy = (v: GroupBy) => setPref("groupBy", v)
  const setShowDone = (v: boolean) => setPref("showDone", v)
  const setScope = (v: Scope) => setPref("scope", v)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const q = useDeferredValue(search.trim())

  const query: TaskQuery = useMemo(
    () => ({
      assignee: scope === "mine" ? "me" : scope === "unassigned" ? "unassigned" : scope === "all" ? undefined : scope.slice(5),
      status: view === "list" && !showDone ? "todo,in_progress" : undefined,
      teamId: teamId ?? undefined,
      q: q || undefined,
    }),
    [scope, view, showDone, teamId, q]
  )

  const { data: tasks, isPending, isError, refetch, isFetching } = useTasks(slug, query, { enabled: hydrated })
  const { data: options } = useTaskOptions(slug)
  const { create, update, remove, reorder } = useTaskMutations(slug, options)
  useTaskRealtime(slug)

  // Selected task (?task=<id>)
  const selectedId = searchParams.get("task")
  const selected = (selectedId && tasks?.find((t) => t.id === selectedId)) || null
  const setSelected = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) params.set("task", id)
      else params.delete("task")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // Open a task from a link even when it's outside the current filters
  const { data: linkedTask } = useQuery({
    queryKey: ["tasks", slug, "one", selectedId],
    queryFn: () => api.get<TaskDto>(`/api/w/${slug}/tasks/${selectedId}`),
    enabled: Boolean(selectedId && tasks && !selected),
    retry: false,
  })

  // Quick add
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState("")
  const [defaults, setDefaults] = useState<TaskPatch>({})
  const parsed = useMemo(
    () => parseQuickAdd(draft, { members: options?.members, teams: options?.teams, meId: user.id }),
    [draft, options, user.id]
  )

  const submit = async () => {
    if (!parsed.title) return
    const scopedAssignee = scope === "mine" ? user.id : scope.startsWith("user:") ? scope.slice(5) : null
    const assigneeId = parsed.assignee?.id ?? (defaults.assigneeId !== undefined ? defaults.assigneeId : scopedAssignee)
    const task = await create.mutateAsync({
      title: parsed.title,
      status: defaults.status,
      assigneeId: options?.canManage === false ? user.id : assigneeId,
      teamId: parsed.team?.id ?? teamId ?? undefined,
      dueAt: parsed.dueAt?.toISOString() ?? defaults.dueAt ?? undefined,
    })
    setDraft("")
    setDefaults({})
    // Tell the user when the new task falls outside the current view
    const visible =
      (scope === "mine" ? task.assignee?.id === user.id : scope === "unassigned" ? !task.assignee : scope === "all" || task.assignee?.id === scope.slice(5)) &&
      (!teamId || task.team?.id === teamId)
    if (!visible) {
      toast.success("Task created", {
        description: task.assignee ? `Assigned to ${task.assignee.id === user.id ? "you" : task.assignee.name || task.assignee.email}` : "Unassigned",
        action: { label: "Open", onClick: () => setSelected(task.id) },
      })
    }
  }

  const startAdd = useCallback((d: TaskPatch = {}) => {
    setDefaults(d)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Keyboard shortcuts: t / c = new task, / = search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      if (document.querySelector("[role=dialog]")) return
      if (e.key === "t" || e.key === "c") {
        e.preventDefault()
        startAdd()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [startAdd])

  const onUpdate = useCallback((id: string, patch: TaskPatch) => update.mutate({ id, patch }), [update])
  const personScope = scope.startsWith("user:") ? options?.members.find((m) => m.id === scope.slice(5)) : null
  const team = teamId ? options?.teams.find((t) => t.id === teamId) : null
  const filtered = Boolean(q || teamId)
  const openCount = tasks?.filter((t) => t.status !== "done").length ?? 0

  const scopeTabs: { value: Scope; label: string }[] = [
    { value: "mine", label: "My tasks" },
    { value: "all", label: "All" },
    { value: "unassigned", label: "Unassigned" },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AreaTopBar>
        <Button size="sm" onClick={() => startAdd()} className="gap-1.5">
          <Plus />
          <span className="hidden sm:inline">New task</span>
          <Kbd className="hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">T</Kbd>
        </Button>
      </AreaTopBar>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5 sm:px-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="sr-only mr-1 text-[15px] font-semibold tracking-tight md:not-sr-only">Tasks</h1>
          <div className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-muted/70 p-0.5" role="tablist" aria-label="Assignee">
            {scopeTabs.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={scope === t.value}
                onClick={() => setScope(t.value)}
                className={cn(
                  "h-7 shrink-0 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  scope === t.value && "bg-background text-foreground shadow-xs dark:bg-accent"
                )}
              >
                {t.label}
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  personScope && "bg-background text-foreground shadow-xs dark:bg-accent"
                )}
                aria-label="Filter by teammate"
              >
                {personScope ? (
                  <>
                    <UserAvatar name={personScope.name} email={personScope.email} src={personScope.avatarUrl} size="xs" />
                    <span className="max-w-28 truncate">{personScope.name || personScope.email}</span>
                  </>
                ) : (
                  <>
                    <Users className="size-3.5" />
                    <span className="hidden sm:inline">Teammate</span>
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tasks assigned to</DropdownMenuLabel>
                {options?.members
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <DropdownMenuItem key={m.id} onSelect={() => setScope(`user:${m.id}`)}>
                      <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="xs" />
                      <span className="truncate">{m.name || m.email}</span>
                      {scope === `user:${m.id}` && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 md:ml-auto">
          <div className="relative min-w-0 flex-1 md:w-56 md:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setSearch(""), e.currentTarget.blur())}
              placeholder="Search tasks"
              aria-label="Search tasks"
              className="h-8 w-full rounded-lg border bg-background pr-7 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <Kbd className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 md:inline-flex">/</Kbd>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn("shrink-0", (team || showDone) && "border-brand/50")} aria-label="Display options">
                <SlidersHorizontal />
                <span className="hidden lg:inline">Display</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {view === "list" && (
                <>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Group by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                    <DropdownMenuRadioItem value="due">Due date</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="assignee">Assignee</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={showDone} onCheckedChange={(v) => setShowDone(Boolean(v))}>
                    Show completed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Team</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={teamId ?? "any"} onValueChange={(v) => setTeamId(v === "any" ? null : v)}>
                <DropdownMenuRadioItem value="any">Any team</DropdownMenuRadioItem>
                {options?.teams.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                    {t.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5" role="radiogroup" aria-label="View">
            {(
              [
                { v: "list", icon: List, label: "List" },
                { v: "board", icon: Columns3, label: "Board" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={view === o.v}
                aria-label={`${o.label} view`}
                title={`${o.label} view`}
                onClick={() => setView(o.v)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  view === o.v && "bg-background text-foreground shadow-xs dark:bg-accent"
                )}
              >
                <o.icon className="size-3.5" />
                <span className="hidden lg:inline">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {team && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
          Team:
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-0.5 text-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} aria-hidden />
            {team.name}
            <button type="button" onClick={() => setTeamId(null)} aria-label="Clear team filter" className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}

      {/* Quick add */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4"
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft("")
              setDefaults({})
              e.currentTarget.blur()
            }
          }}
          placeholder="Add a task… try “Call Hannah back @maya tomorrow”"
          aria-label="New task"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/80"
          maxLength={300}
        />
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {defaults.status && <Chip>{defaults.status === "in_progress" ? "In progress" : defaults.status === "done" ? "Done" : "To do"}</Chip>}
          {parsed.assignee ? (
            <Chip>
              <AssigneeAvatar assignee={{ ...parsed.assignee, avatarUrl: null }} />
              {parsed.assignee.id === user.id ? "Me" : parsed.assignee.name || parsed.assignee.email}
            </Chip>
          ) : defaults.assigneeId !== undefined ? (
            <Chip>{defaults.assigneeId === null ? "Unassigned" : options?.members.find((m) => m.id === defaults.assigneeId)?.name}</Chip>
          ) : null}
          {parsed.team && (
            <Chip>
              <span className="size-2 rounded-full" style={{ backgroundColor: options?.teams.find((t) => t.id === parsed.team?.id)?.color }} aria-hidden />
              {parsed.team.name}
            </Chip>
          )}
          {(parsed.dueAt || defaults.dueAt) && (
            <Chip>
              <CalendarDays className="size-3" />
              {formatDue(parsed.dueAt ?? new Date(defaults.dueAt!))}
              <span className="text-muted-foreground">{format(parsed.dueAt ?? new Date(defaults.dueAt!), "MMM d")}</span>
            </Chip>
          )}
        </div>
        {draft.trim() && (
          <Button type="submit" size="xs" variant="secondary" disabled={!parsed.title || create.isPending} className="shrink-0">
            {create.isPending ? <Spinner /> : <CornerDownLeft />}
            Add
          </Button>
        )}
      </form>

      {/* Content */}
      <div className={cn("relative min-h-0 flex-1", view === "board" ? "overflow-hidden" : "overflow-y-auto")}>
        {isFetching && !isPending && (
          <div className="pointer-events-none absolute top-2 right-3 z-10" aria-hidden>
            <Spinner className="size-3.5 text-muted-foreground" />
          </div>
        )}
        {!hydrated || isPending ? (
          <TasksSkeleton />
        ) : isError ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>Couldn’t load tasks</EmptyTitle>
              <EmptyDescription>Check your connection and try again.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        ) : tasks.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">{filtered ? <Search /> : scope === "mine" ? <CheckCheck /> : <ListTodo />}</EmptyMedia>
              <EmptyTitle>
                {filtered ? "No matching tasks" : scope === "mine" ? "You’re all caught up" : "No tasks here yet"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Try a different search or clear the filters."
                  : "Tasks keep follow-ups from slipping through the cracks. Create one here or from any conversation."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("")
                    setTeamId(null)
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => startAdd()}>
                  <Plus /> New task
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : view === "board" ? (
          <TaskBoardView
            tasks={tasks}
            onOpen={setSelected}
            onReorder={(status, ids) => reorder.mutate({ status, ids })}
            onAdd={startAdd}
          />
        ) : (
          <TaskListView
            tasks={tasks}
            groupBy={groupBy}
            meId={user.id}
            options={options}
            selectedId={selectedId}
            onOpen={setSelected}
            onUpdate={onUpdate}
            onAddInGroup={startAdd}
          />
        )}
      </div>

      {tasks && tasks.length > 0 && (
        <div className="safe-bottom hidden shrink-0 items-center gap-3 border-t px-4 py-1.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase md:flex">
          <span>
            {openCount} open{showDone || view === "board" ? ` · ${tasks.length - openCount} done` : ""}
          </span>
          <span className="ml-auto flex items-center gap-1.5 normal-case">
            <Kbd>T</Kbd> new task <Kbd>/</Kbd> search
          </span>
        </div>
      )}

      <TaskDetailSheet
        slug={slug}
        task={selected ?? linkedTask ?? null}
        options={options}
        meId={user.id}
        open={Boolean(selectedId && (selected ?? linkedTask))}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdate={(id, patch) => update.mutate({ id, patch })}
        onDelete={(id) => remove.mutate(id)}
      />
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 text-xs font-medium whitespace-nowrap">
      {children}
    </span>
  )
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col" aria-busy aria-label="Loading tasks">
      <div className="h-9 border-b bg-surface/60" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b border-border/60 px-4">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
          <Skeleton className="ml-auto h-4 w-14" />
          <Skeleton className="size-5 rounded-full" />
        </div>
      ))}
    </div>
  )
}
