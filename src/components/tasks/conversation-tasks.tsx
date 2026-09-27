"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronRight, Plus } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { parseQuickAdd } from "./quick-add"
import { AssigneeAvatar, AssigneePicker, DueBadge, DuePicker, StatusIcon } from "./task-fields"
import { TaskDetailSheet } from "./task-detail-sheet"
import { useTaskMutations, useTaskOptions, useTasks, type TaskDto, type TaskOptions, type TaskPatch } from "./use-tasks"

/**
 * Compact task list for the conversation sidebar: shows the conversation's
 * tasks, lets members add one inline ("Follow up @maya fri") and open details.
 */
export function ConversationTasks({
  slug,
  conversationId,
  className,
  defaultCollapsed = false,
}: {
  slug: string
  conversationId: string
  className?: string
  defaultCollapsed?: boolean
}) {
  const { user } = useOrg()
  const { data: tasks, isPending } = useTasks(slug, { conversationId })
  const { data: options } = useTaskOptions(slug)
  const { create, update, remove } = useTaskMutations(slug, options)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [showDone, setShowDone] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => parseQuickAdd(draft, { members: options?.members, teams: options?.teams, meId: user.id }),
    [draft, options, user.id]
  )
  const open = (tasks ?? []).filter((t) => t.status !== "done")
  const done = (tasks ?? []).filter((t) => t.status === "done")
  const selected = tasks?.find((t) => t.id === openId) ?? null

  const submit = async () => {
    if (!parsed.title) return
    await create.mutateAsync({
      title: parsed.title,
      conversationId,
      assigneeId: options?.canManage === false ? user.id : (parsed.assignee?.id ?? user.id),
      teamId: parsed.team?.id,
      dueAt: parsed.dueAt?.toISOString(),
    })
    setDraft("")
    inputRef.current?.focus()
  }

  const startAdding = () => {
    setCollapsed(false)
    setAdding(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <section className={cn("flex flex-col", className)} aria-label="Tasks">
      <div className="flex h-8 items-center gap-1">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-1.5 rounded-md py-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-3 transition-transform", !collapsed && "rotate-90")} />
          Tasks
          {open.length > 0 && <span className="tabular-nums">· {open.length}</span>}
        </button>
        <Link
          href={`/w/${slug}/tasks`}
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open all tasks"
          title="Open all tasks"
        >
          <ArrowUpRight className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={startAdding}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Add task"
          title="Add task"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {isPending ? (
            <div className="flex flex-col gap-2 py-1.5">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : (
            <>
              <ul className="flex flex-col">
                {open.map((t) => (
                  <CompactTask
                    key={t.id}
                    task={t}
                    meId={user.id}
                    options={options}
                    onOpen={() => setOpenId(t.id)}
                    onUpdate={(patch) => update.mutate({ id: t.id, patch })}
                  />
                ))}
                {showDone &&
                  done.map((t) => (
                    <CompactTask
                      key={t.id}
                      task={t}
                      meId={user.id}
                      options={options}
                      onOpen={() => setOpenId(t.id)}
                      onUpdate={(patch) => update.mutate({ id: t.id, patch })}
                    />
                  ))}
              </ul>
              {done.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDone((s) => !s)}
                  className="self-start rounded px-1 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showDone ? "Hide completed" : `${done.length} completed`}
                </button>
              )}
              {open.length === 0 && done.length === 0 && !adding && (
                <button
                  type="button"
                  onClick={startAdding}
                  className="flex items-center gap-2 rounded-md py-1.5 text-left text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" /> Add a follow-up task
                </button>
              )}
              {adding && (
                <form
                  className="mt-1 flex items-center gap-2 rounded-md border bg-background px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 dark:bg-input/30"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                  }}
                >
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDraft("")
                        setAdding(false)
                      }
                    }}
                    onBlur={() => !draft.trim() && setAdding(false)}
                    placeholder="Follow up @me fri"
                    aria-label="New task for this conversation"
                    maxLength={300}
                    className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                  {create.isPending && <Spinner className="size-3.5" />}
                </form>
              )}
              {adding && draft.trim() && (parsed.assignee || parsed.dueAt) && (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {parsed.assignee && <>For {parsed.assignee.id === user.id ? "you" : parsed.assignee.name}</>}
                  {parsed.assignee && parsed.dueAt && " · "}
                  {parsed.dueAt && <>due {parsed.dueLabel?.toLowerCase() ?? parsed.dueAt.toLocaleDateString()}</>}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <TaskDetailSheet
        slug={slug}
        task={selected}
        options={options}
        meId={user.id}
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setOpenId(null)}
        onUpdate={(id, patch) => update.mutate({ id, patch })}
        onDelete={(id) => remove.mutate(id)}
      />
    </section>
  )
}

function CompactTask({
  task,
  meId,
  options,
  onOpen,
  onUpdate,
}: {
  task: TaskDto
  meId: string
  options: TaskOptions | undefined
  onOpen: () => void
  onUpdate: (patch: TaskPatch) => void
}) {
  const done = task.status === "done"
  return (
    <li className="group/task -mx-1.5 flex min-h-8 items-center gap-2 rounded-md px-1.5 hover:bg-accent/60">
      <button
        type="button"
        disabled={!task.canEdit}
        onClick={() => onUpdate({ status: done ? "todo" : "done" })}
        className="flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
      >
        <StatusIcon status={task.status} className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 truncate py-1 text-left text-[13px] outline-none focus-visible:underline",
          done && "text-muted-foreground line-through decoration-muted-foreground/40"
        )}
        title={task.title}
      >
        {task.title}
      </button>
      {task.dueAt ? (
        <DuePicker value={task.dueAt} onChange={(iso) => onUpdate({ dueAt: iso })} disabled={!task.canEdit} align="end">
          <button type="button" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Change due date">
            <DueBadge dueAt={task.dueAt} status={task.status} />
          </button>
        </DuePicker>
      ) : null}
      {options ? (
        <AssigneePicker
          members={options.members}
          value={task.assignee?.id ?? null}
          meId={meId}
          restrictToMe={!options.canManage}
          disabled={!task.canEdit}
          onChange={(id) => onUpdate({ assigneeId: id })}
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
    </li>
  )
}
