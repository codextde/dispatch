"use client"

import { useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Inbox, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AssigneeAvatar, DueBadge, STATUS_META, STATUS_ORDER, StatusIcon } from "./task-fields"
import type { TaskDto, TaskPatch, TaskStatus } from "./use-tasks"

type Columns = Record<TaskStatus, string[]>

function buildColumns(tasks: TaskDto[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] }
  const sorted = [...tasks].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
  for (const t of sorted) cols[t.status].push(t.id)
  return cols
}

function TaskCard({ task, overlay, onOpen }: { task: TaskDto; overlay?: boolean; onOpen?: (id: string) => void }) {
  const done = task.status === "done"
  return (
    <div
      className={cn(
        "group/card flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow",
        overlay ? "rotate-[1.5deg] cursor-grabbing shadow-lg ring-1 ring-brand/30" : "hover:border-foreground/15 hover:shadow-sm"
      )}
      onClick={() => onOpen?.(task.id)}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={task.status} className="mt-0.5 size-3.5" />
        <span className={cn("line-clamp-3 text-[13.5px] leading-snug font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
          {task.title}
        </span>
      </div>
      {(task.conversation || task.team || task.dueAt || task.assignee) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-5.5">
          <DueBadge dueAt={task.dueAt} status={task.status} className="-ml-1.5" />
          {task.conversation && (
            <span className="inline-flex max-w-full min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground" title={task.conversation.subject}>
              <Inbox className="size-3 shrink-0" />
              <span className="truncate">#{task.conversation.number}</span>
            </span>
          )}
          {task.team && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: task.team.color }} aria-hidden />
              {task.team.name}
            </span>
          )}
          <span className="ml-auto">
            <AssigneeAvatar assignee={task.assignee} />
          </span>
        </div>
      )}
    </div>
  )
}

function SortableCard({ task, onOpen }: { task: TaskDto; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !task.canEdit,
    data: { status: task.status },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-label={`${task.title}, ${STATUS_META[task.status].label}. Press space to move, enter to open.`}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id)
        listeners?.onKeyDown?.(e)
      }}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  )
}

function Column({
  status,
  ids,
  tasks,
  onOpen,
  onAdd,
}: {
  status: TaskStatus
  ids: string[]
  tasks: Map<string, TaskDto>
  onOpen: (id: string) => void
  onAdd: (defaults: TaskPatch) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } })
  return (
    <section
      aria-label={STATUS_META[status].label}
      className="flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl bg-surface/70 sm:w-80 dark:bg-surface"
    >
      <div className="flex h-11 items-center gap-2 px-3">
        <StatusIcon status={status} className="size-3.5" />
        <h2 className="text-[13px] font-semibold">{STATUS_META[status].label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{ids.length}</span>
        <button
          type="button"
          onClick={() => onAdd({ status })}
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Add task to ${STATUS_META[status].label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "scrollbar-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl px-2 pb-3 transition-colors",
            isOver && "bg-brand-soft/40"
          )}
        >
          {ids.map((id) => {
            const t = tasks.get(id)
            return t ? <SortableCard key={id} task={t} onOpen={onOpen} /> : null
          })}
          {ids.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
}

export function TaskBoardView({
  tasks,
  onOpen,
  onReorder,
  onAdd,
}: {
  tasks: TaskDto[]
  onOpen: (id: string) => void
  onReorder: (status: TaskStatus, ids: string[]) => void
  onAdd: (defaults: TaskPatch) => void
}) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const serverColumns = useMemo(() => buildColumns(tasks), [tasks])
  const [activeId, setActiveId] = useState<string | null>(null)
  // Local order while dragging, kept after the drop until fresh task data arrives
  const [override, setOverride] = useState<{ cols: Columns; base: TaskDto[] } | null>(null)
  const columns = override && (activeId || override.base === tasks) ? override.cols : serverColumns
  const setColumns = (fn: (cols: Columns) => Columns) => setOverride((o) => ({ cols: fn(o ? o.cols : serverColumns), base: tasks }))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const findColumn = (id: string): TaskStatus | null => {
    if (id.startsWith("column:")) return id.slice(7) as TaskStatus
    return (STATUS_ORDER.find((s) => columns[s].includes(id)) as TaskStatus | undefined) ?? null
  }

  const onDragStart = (e: DragStartEvent) => {
    setOverride({ cols: serverColumns, base: tasks })
    setActiveId(String(e.active.id))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = findColumn(String(active.id))
    const to = findColumn(String(over.id))
    if (!from || !to || from === to) return
    setColumns((cols) => {
      const fromItems = cols[from].filter((id) => id !== active.id)
      const overIndex = cols[to].indexOf(String(over.id))
      const index = overIndex >= 0 ? overIndex : cols[to].length
      const toItems = [...cols[to]]
      toItems.splice(index, 0, String(active.id))
      return { ...cols, [from]: fromItems, [to]: toItems }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    setActiveId(null)
    if (!over) {
      setOverride(null)
      return
    }
    const to = findColumn(String(over.id))
    if (!to) return
    let ids = columns[to]
    const oldIndex = ids.indexOf(id)
    const newIndex = String(over.id).startsWith("column:") ? ids.length - 1 : ids.indexOf(String(over.id))
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) ids = arrayMove(ids, oldIndex, newIndex)
    setColumns((cols) => ({ ...cols, [to]: ids }))
    const original = byId.get(id)
    const unchanged = original?.status === to && serverColumns[to].join() === ids.join()
    if (!unchanged) onReorder(to, ids)
  }

  const active = activeId ? byId.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverride(null)
      }}
    >
      <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto p-3 sm:snap-none sm:p-4">
        {STATUS_ORDER.map((s) => (
          <Column key={s} status={s} ids={columns[s]} tasks={byId} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {active ? <TaskCard task={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}
