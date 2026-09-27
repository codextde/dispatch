"use client"

import { useId, useMemo, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { EyeOff, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pluralize } from "@/components/settings/format"
import { cn } from "@/lib/utils"
import { flattenLabels, MAX_LABEL_DEPTH, type FlatLabel, type LabelItem } from "./label-utils"

export type TreeHandlers = {
  onEdit: (label: LabelItem) => void
  onAddChild: (parent: LabelItem) => void
  onDelete: (label: LabelItem) => void
  onToggleSidebar: (label: LabelItem) => void
  /** Persist a new order of siblings; resolves false when it failed */
  onReorder: (parentId: string | null, orderedIds: string[]) => Promise<boolean>
}

function LabelRow({
  label,
  editable,
  handlers,
  dragging,
}: {
  label: FlatLabel
  editable: boolean
  handlers: TreeHandlers
  dragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: label.id,
    disabled: !editable,
  })
  const style = { transform: CSS.Translate.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex h-11 items-center gap-2 border-b bg-card pr-2 pl-2 last:border-b-0 sm:pr-3",
        isDragging && "z-10 rounded-lg border shadow-lg ring-1 ring-foreground/10",
        dragging && !isDragging && "transition-transform"
      )}
    >
      {editable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label.name}`}
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="w-1" aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: (label.depth - 1) * 22 }}>
        {label.depth > 1 && <span aria-hidden className="-mt-2.5 h-3 w-2.5 shrink-0 rounded-bl-[4px] border-b border-l border-border" />}
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
          style={{ backgroundColor: label.color }}
        />
        <button
          type="button"
          disabled={!editable}
          onClick={() => handlers.onEdit(label)}
          className="min-w-0 truncate text-left text-[13.5px] font-medium enabled:hover:underline enabled:hover:underline-offset-2 disabled:cursor-default"
        >
          {label.name}
        </button>
        {!label.showInSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 text-muted-foreground" aria-label="Hidden from sidebar">
                <EyeOff className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Hidden from the inbox sidebar</TooltipContent>
          </Tooltip>
        )}
      </div>

      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
        {pluralize(label.conversationCount, "conversation")}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:hidden">{label.conversationCount.toLocaleString("en-US")}</span>

      {editable && (
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${label.name}`}
            className="hidden text-muted-foreground sm:inline-flex"
            onClick={() => handlers.onEdit(label)}
          >
            <Pencil />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${label.name}`} className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => handlers.onEdit(label)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled={label.depth >= MAX_LABEL_DEPTH} onClick={() => handlers.onAddChild(label)}>
                <Plus /> Add nested label
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlers.onToggleSidebar(label)}>
                <EyeOff /> {label.showInSidebar ? "Hide from sidebar" : "Show in sidebar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handlers.onDelete(label)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

/**
 * Sortable label tree for one scope. Rendered as a flat list with
 * indentation; dragging reorders an item among its siblings (its nested
 * labels are hidden while dragging and move along).
 */
export function LabelTree({
  labels,
  editable,
  handlers,
  ariaLabel,
}: {
  labels: LabelItem[]
  editable: boolean
  handlers: TreeHandlers
  ariaLabel: string
}) {
  const dndId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)
  const flat = useMemo(() => flattenLabels(labels), [labels])

  // Hide the dragged item's descendants so the subtree moves as one
  const visible = useMemo(() => {
    if (!activeId) return flat
    const hidden = new Set<string>()
    let collecting = false
    let activeDepth = 0
    for (const l of flat) {
      if (l.id === activeId) {
        collecting = true
        activeDepth = l.depth
        continue
      }
      if (collecting && l.depth > activeDepth) hidden.add(l.id)
      else collecting = false
    }
    return flat.filter((l) => !hidden.has(l.id))
  }, [flat, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const a = flat.find((l) => l.id === active.id)
    const o = flat.find((l) => l.id === over.id)
    if (!a || !o) return
    if ((a.parentId ?? null) !== (o.parentId ?? null)) {
      toast.info("Labels can be reordered within the same level. Use Edit to move a label under another parent.")
      return
    }
    const siblings = flat.filter((l) => (l.parentId ?? null) === (a.parentId ?? null)).map((l) => l.id)
    const next = arrayMove(siblings, siblings.indexOf(a.id), siblings.indexOf(o.id))
    await handlers.onReorder(a.parentId ?? null, next)
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To reorder a label, press space or enter to pick it up, use the arrow keys to move it among labels at the same level, then press space or enter again to drop it.",
        },
      }}
    >
      <SortableContext items={visible.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={ariaLabel} className="border-t">
          {visible.map((label) => (
            <LabelRow key={label.id} label={label} editable={editable} handlers={handlers} dragging={Boolean(activeId)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
