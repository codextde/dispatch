"use client"

import { useMemo, useState } from "react"
import { differenceInCalendarDays } from "date-fns"
import { ChevronRight, Inbox, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AssigneeAvatar,
  AssigneePicker,
  DueBadge,
  STATUS_META,
  STATUS_ORDER,
  StatusIcon,
} from "./task-fields"
import type { TaskDto, TaskOptions, TaskPatch, TaskStatus } from "./use-tasks"

export type GroupBy = "status" | "assignee" | "due"

export type TaskGroup = {
  key: string
  label: string
  icon?: React.ReactNode
  tasks: TaskDto[]
  /** Defaults applied when adding a task from this group's "+" button */
  defaults: TaskPatch
  tone?: "danger" | "warning"
}

function dueGroup(t: TaskDto): "overdue" | "today" | "upcoming" | "none" | "done" {
  if (t.status === "done") return "done"
  if (!t.dueAt) return "none"
  const diff = differenceInCalendarDays(new Date(t.dueAt), new Date())
  if (diff < 0) return "overdue"
  if (diff === 0) return "today"
  return "upcoming"
}

const byPosition = (a: TaskDto, b: TaskDto) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)
const byDue = (a: TaskDto, b: TaskDto) =>
  (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || byPosition(a, b)

export function groupTasks(tasks: TaskDto[], groupBy: GroupBy, meId: string): TaskGroup[] {
  if (groupBy === "status") {
    return STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      icon: <StatusIcon status={s} className="size-3.5" />,
      tasks: tasks.filter((t) => t.status === s).sort(s === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byPosition),
      defaults: { status: s },
    }))
  }
  if (groupBy === "due") {
    const today = new Date()
    today.setHours(17, 0, 0, 0)
    const groups: TaskGroup[] = [
      { key: "overdue", label: "Overdue", tasks: [], defaults: {}, tone: "danger" },
      { key: "today", label: "Today", tasks: [], defaults: { dueAt: today.toISOString() }, tone: "warning" },
      { key: "upcoming", label: "Upcoming", tasks: [], defaults: {} },
      { key: "none", label: "No due date", tasks: [], defaults: {} },
      { key: "done", label: "Completed", tasks: [], defaults: { status: "done" } },
    ]
    for (const t of tasks) groups.find((g) => g.key === dueGroup(t))!.tasks.push(t)
    for (const g of groups) g.tasks.sort(g.key === "done" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : byDue)
    return groups.filter((g) => g.tasks.length || g.key === "today")
  }
  // assignee
  const map = new Map<string, TaskGroup>()
  for (const t of tasks) {
    const key = t.assignee?.id ?? "unassigned"
    if (!map.has(key)) {
      const label = t.assignee ? (t.assignee.id === meId ? "Me" : t.assignee.name || t.assignee.email) : "Unassigned"
      map.set(key, {
        key,
        label,
        icon: <AssigneeAvatar assignee={t.assignee} />,
        tasks: [],
        defaults: { assigneeId: t.assignee?.id ?? null },
      })
    }
    map.get(key)!.tasks.push(t)
  }
  const statusRank = (s: TaskStatus) => STATUS_ORDER.indexOf(s)
  const groups = [...map.values()]
  for (const g of groups) g.tasks.sort((a, b) => statusRank(a.status) - statusRank(b.status) || byDue(a, b))
  groups.sort((a, b) => {
    const rank = (g: TaskGroup) => (g.key === meId ? 0 : g.key === "unassigned" ? 2 : 1)
    return rank(a) - rank(b) || a.label.localeCompare(b.label)
  })
  return groups
}

export function TaskRow({
  task,
  selected,
  meId,
  options,
  onOpen,
  onUpdate,
  showConversation = true,
}: {
  task: TaskDto
  selected?: boolean
  meId: string
  options?: TaskOptions
  onOpen: (id: string) => void
  onUpdate: (id: string, patch: TaskPatch) => void
  showConversation?: boolean
}) {
  const done = task.status === "done"
  return (
    <div
      role="listitem"
      className={cn(
        "group/row relative flex min-h-11 items-center gap-2.5 border-b border-border/60 px-3 transition-colors hover:bg-accent/50 sm:px-4",
        selected && "bg-accent/70"
      )}
    >
      <button
        type="button"
        disabled={!task.canEdit}
        onClick={() => onUpdate(task.id, { status: done ? "todo" : "done" })}
        className="-m-1.5 flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
        title={done ? "Reopen" : "Mark done"}
      >
        <StatusIcon status={task.status} className="transition-transform group-hover/row:scale-110" />
      </button>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className={cn("truncate text-[13.5px]", done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
          {task.title}
        </span>
        {task.description && <span className="hidden truncate text-[12.5px] text-muted-foreground lg:inline">{task.description.split("\n")[0]}</span>}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {showConversation && task.conversation && (
          <span
            className="hidden max-w-48 items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[11.5px] text-muted-foreground sm:inline-flex"
            title={task.conversation.subject}
          >
            <Inbox className="size-3 shrink-0" />
            <span className="truncate">#{task.conversation.number}</span>
          </span>
        )}
        {task.team && (
          <span className="hidden items-center gap-1 text-[11.5px] text-muted-foreground md:inline-flex">
            <span className="size-2 rounded-full" style={{ backgroundColor: task.team.color }} aria-hidden />
            {task.team.name}
          </span>
        )}
        <DueBadge dueAt={task.dueAt} status={task.status} />
        {options ? (
          <AssigneePicker
            members={options.members}
            value={task.assignee?.id ?? null}
            meId={meId}
            restrictToMe={!options.canManage}
            disabled={!task.canEdit}
            onChange={(id) => onUpdate(task.id, { assigneeId: id })}
            align="end"
          >
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={task.assignee ? `Assigned to ${task.assignee.name || task.assignee.email}` : "Assign"}
            >
              <AssigneeAvatar assignee={task.assignee} />
            </button>
          </AssigneePicker>
        ) : (
          <AssigneeAvatar assignee={task.assignee} />
        )}
      </div>
    </div>
  )
}

export function TaskListView({
  tasks,
  groupBy,
  meId,
  options,
  selectedId,
  onOpen,
  onUpdate,
  onAddInGroup,
}: {
  tasks: TaskDto[]
  groupBy: GroupBy
  meId: string
  options?: TaskOptions
  selectedId: string | null
  onOpen: (id: string) => void
  onUpdate: (id: string, patch: TaskPatch) => void
  onAddInGroup: (defaults: TaskPatch) => void
}) {
  const groups = useMemo(() => groupTasks(tasks, groupBy, meId), [tasks, groupBy, meId])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: false })

  return (
    <div className="pb-24">
      {groups.map((g) => {
        const isCollapsed = collapsed[`${groupBy}:${g.key}`] ?? false
        return (
          <section key={g.key} aria-label={g.label}>
            <div className="sticky top-0 z-[1] flex h-9 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:px-4">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [`${groupBy}:${g.key}`]: !isCollapsed }))}
                className="flex min-w-0 items-center gap-2 rounded-md py-1 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={!isCollapsed}
              >
                <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
                {g.icon}
                <span
                  className={cn(
                    "truncate",
                    g.tone === "danger" && "text-red-600 dark:text-red-400",
                    g.tone === "warning" && "text-amber-700 dark:text-amber-300"
                  )}
                >
                  {g.label}
                </span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{g.tasks.length}</span>
              </button>
              {g.key !== "done" && g.key !== "overdue" && (
                <button
                  type="button"
                  onClick={() => onAddInGroup(g.defaults)}
                  className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Add task to ${g.label}`}
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>
            {!isCollapsed && (
              <div role="list">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    meId={meId}
                    options={options}
                    selected={selectedId === t.id}
                    onOpen={onOpen}
                    onUpdate={onUpdate}
                  />
                ))}
                {g.tasks.length === 0 && (
                  <div className="px-11 py-3 text-[13px] text-muted-foreground">Nothing here yet.</div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
