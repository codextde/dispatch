"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { marked } from "marked"
import DOMPurify from "isomorphic-dompurify"
import { CalendarDays, CheckCircle2, Eye, Inbox, Pencil, RotateCcw, Trash2, Users } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  AssigneeAvatar,
  AssigneePicker,
  DuePicker,
  STATUS_META,
  StatusIcon,
  StatusMenu,
  TeamMenu,
  dueState,
  formatDue,
} from "./task-fields"
import type { TaskDto, TaskOptions, TaskPatch } from "./use-tasks"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 min-h-8">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const fieldButton =
  "flex h-8 max-w-full min-w-0 items-center gap-2 rounded-md px-2 -mx-2 text-[13px] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"

export function TaskDetailSheet(props: {
  slug: string
  task: TaskDto | null
  options: TaskOptions | undefined
  meId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (id: string, patch: TaskPatch) => void
  onDelete: (id: string) => void
}) {
  return (
    <Sheet open={props.open && Boolean(props.task)} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        {props.task && <TaskDetailBody key={props.task.id} {...props} task={props.task} />}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetailBody({
  slug,
  task,
  options,
  meId,
  onOpenChange,
  onUpdate,
  onDelete,
}: {
  slug: string
  task: TaskDto
  options: TaskOptions | undefined
  meId: string
  onOpenChange: (open: boolean) => void
  onUpdate: (id: string, patch: TaskPatch) => void
  onDelete: (id: string) => void
}) {
  // Local edit state; the component is keyed by task id so it resets per task
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [preview, setPreview] = useState(Boolean(task.description))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const html = useMemo(
    () => (preview && description ? DOMPurify.sanitize(marked.parse(description, { async: false, breaks: true }) as string) : ""),
    [preview, description]
  )

  const editable = task.canEdit
  const members = options?.members ?? []
  const teams = options?.teams ?? []

  const commitTitle = () => {
    const t = title.replace(/\s+/g, " ").trim()
    if (!t) return setTitle(task.title)
    if (t !== task.title) onUpdate(task.id, { title: t })
  }
  const commitDescription = () => {
    const d = description.trim()
    if (d !== (task.description ?? "")) onUpdate(task.id, { description: d || null })
    if (d) setPreview(true)
  }

  const due = dueState(task.dueAt, task.status)

  return (
    <>
      <SheetHeader className="gap-3 border-b px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 pr-8">
          <StatusMenu value={task.status} onChange={(s) => onUpdate(task.id, { status: s })} disabled={!editable}>
            <button type="button" className={cn(fieldButton, "mx-0 h-7 bg-muted/60 px-2 text-xs font-medium")}>
              <StatusIcon status={task.status} className="size-3.5" />
              {STATUS_META[task.status].label}
            </button>
          </StatusMenu>
          {task.conversation && (
            <span className="truncate font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              #{task.conversation.number}
            </span>
          )}
        </div>
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <SheetDescription className="sr-only">Task details</SheetDescription>
        <Textarea
          ref={titleRef}
          value={title}
          disabled={!editable}
          aria-label="Task title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              titleRef.current?.blur()
            }
            if (e.key === "Escape") {
              setTitle(task.title)
            }
          }}
          rows={1}
          className={cn(
            "field-sizing-content min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-lg leading-snug font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent",
            task.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40"
          )}
        />
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-1">
          <Row label="Assignee">
            <AssigneePicker
              members={members}
              value={task.assignee?.id ?? null}
              meId={meId}
              restrictToMe={!options?.canManage}
              disabled={!editable}
              onChange={(id) => onUpdate(task.id, { assigneeId: id })}
            >
              <button type="button" className={fieldButton}>
                <AssigneeAvatar assignee={task.assignee} />
                <span className={cn("truncate", !task.assignee && "text-muted-foreground")}>
                  {task.assignee ? task.assignee.name || task.assignee.email : "Unassigned"}
                </span>
              </button>
            </AssigneePicker>
          </Row>
          <Row label="Due date">
            <DuePicker value={task.dueAt} onChange={(iso) => onUpdate(task.id, { dueAt: iso })} disabled={!editable}>
              <button
                type="button"
                className={cn(
                  fieldButton,
                  due === "overdue" && "text-red-600 dark:text-red-400",
                  due === "today" && "text-amber-700 dark:text-amber-300",
                  !task.dueAt && "text-muted-foreground"
                )}
              >
                <CalendarDays className="size-4 shrink-0 opacity-70" />
                <span className="truncate">
                  {task.dueAt ? `${formatDue(task.dueAt, { long: true })} · ${format(new Date(task.dueAt), "MMM d")}` : "No due date"}
                </span>
                {due === "overdue" && <span className="text-xs font-medium">Overdue</span>}
              </button>
            </DuePicker>
          </Row>
          <Row label="Team">
            <TeamMenu teams={teams} value={task.team?.id ?? null} onChange={(id) => onUpdate(task.id, { teamId: id })} disabled={!editable}>
              <button type="button" className={cn(fieldButton, !task.team && "text-muted-foreground")}>
                {task.team ? (
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: task.team.color }} aria-hidden />
                ) : (
                  <Users className="size-4 shrink-0 opacity-70" />
                )}
                <span className="truncate">{task.team?.name ?? "No team"}</span>
              </button>
            </TeamMenu>
          </Row>
          {task.conversation && (
            <Row label="Conversation">
              <Link
                href={`/w/${slug}/all/${task.conversation.id}`}
                className={cn(fieldButton, "text-foreground")}
                title={task.conversation.subject}
              >
                <Inbox className="size-4 shrink-0 opacity-70" />
                <span className="truncate">{task.conversation.subject || "(no subject)"}</span>
              </Link>
            </Row>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Description</span>
            {editable && description && (
              <Button variant="ghost" size="xs" onClick={() => setPreview((p) => !p)} className="text-muted-foreground">
                {preview ? <Pencil /> : <Eye />}
                {preview ? "Edit" : "Preview"}
              </Button>
            )}
          </div>
          {preview && description ? (
            <div
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={() => editable && setPreview(false)}
              onKeyDown={(e) => editable && e.key === "Enter" && setPreview(false)}
              className="prose-task rounded-md text-[13.5px] leading-relaxed text-foreground/90 [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[12.5px] [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <Textarea
              value={description}
              disabled={!editable}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              placeholder={editable ? "Add details, links or a checklist… (Markdown supported)" : "No description"}
              className="min-h-32 resize-y text-[13.5px] leading-relaxed"
              aria-label="Description"
            />
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
          <AssigneeAvatar assignee={task.createdBy ? { ...task.createdBy, avatarUrl: null } : null} />
          <span>
            Created by {task.createdBy?.name || task.createdBy?.email || "someone"} ·{" "}
            <time dateTime={task.createdAt} title={format(new Date(task.createdAt), "PPpp")}>
              {formatDistanceToNow(new Date(task.createdAt), {
                addSuffix: true,
              })}
            </time>
            {task.completedAt && (
              <>
                {" "}
                · completed{" "}
                {formatDistanceToNow(new Date(task.completedAt), {
                  addSuffix: true,
                })}
              </>
            )}
          </span>
        </div>
      </div>

      {editable && (
        <SheetFooter className="safe-bottom flex-row items-center justify-between gap-2 border-t px-5 py-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
          {task.status === "done" ? (
            <Button variant="outline" size="sm" onClick={() => onUpdate(task.id, { status: "todo" })}>
              <RotateCcw /> Reopen
            </Button>
          ) : (
            <Button size="sm" onClick={() => onUpdate(task.id, { status: "done" })}>
              <CheckCircle2 /> Mark done
            </Button>
          )}
        </SheetFooter>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>“{task.title}” will be removed for everyone. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDelete(task.id)
                onOpenChange(false)
              }}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
