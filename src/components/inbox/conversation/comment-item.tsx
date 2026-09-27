"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Ellipsis, FaceSlightlySmilingPlus, Link2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { api } from "@/lib/api-client"
import { fullTime, memberName, threadTime } from "@/lib/inbox/format"
import type { ConversationThread, ThreadComment } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxKeys } from "@/hooks/inbox/queries"
import { AttachmentList } from "../attachments"
import { EmojiPickerPopover } from "../emoji-picker"
import { useInbox } from "../inbox-provider"
import { EditorContent, PROSE, isEditorEmpty, useCommentEditor } from "../composer/editor"

function useThreadCache(conversationId: string) {
  const { slug } = useInbox()
  const qc = useQueryClient()
  const key = inboxKeys.thread(slug, conversationId)
  return {
    patchComment(id: string, fn: (c: ThreadComment) => ThreadComment | null) {
      const prev = qc.getQueryData<ConversationThread>(key)
      if (!prev) return prev
      qc.setQueryData<ConversationThread>(key, {
        ...prev,
        comments: prev.comments.flatMap((c) => {
          if (c.id !== id) return [c]
          const next = fn(c)
          return next ? [next] : []
        }),
      })
      return prev
    },
    restore(prev: ConversationThread | undefined) {
      if (prev) qc.setQueryData(key, prev)
    },
    invalidate() {
      void qc.invalidateQueries({ queryKey: key })
    },
  }
}

function EditForm({ comment, onDone }: { comment: ThreadComment; onDone: () => void }) {
  const { slug, members } = useInbox()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (body: string) => api.patch(`/api/w/${slug}/comments/${comment.id}`, { body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.threads(slug) })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })
  const submit = () => {
    if (!editor || isEditorEmpty(editor)) return
    save.mutate(editor.getHTML())
  }
  const editor = useCommentEditor({ members, content: comment.body, autofocus: true, onSubmit: submit, onEscape: onDone, placeholder: "Edit comment…" })
  return (
    <div className="mt-1 rounded-lg border bg-card px-3 py-2">
      <EditorContent editor={editor} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={onDone}>
          Cancel
        </Button>
        <Button size="xs" onClick={submit} disabled={save.isPending}>
          Save
        </Button>
      </div>
    </div>
  )
}

/**
 * Internal comment (or chat message): author, body with @mentions,
 * reactions, attachments; authors can edit and delete their own.
 */
export function CommentItem({
  comment,
  conversationId,
  compact = false,
  highlighted = false,
  variant = "comment",
}: {
  comment: ThreadComment
  conversationId: string
  /** Consecutive message by the same author (chat grouping) */
  compact?: boolean
  highlighted?: boolean
  variant?: "comment" | "chat"
}) {
  const { slug, member, meId } = useInbox()
  const cache = useThreadCache(conversationId)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const author = member(comment.authorId)
  const mine = comment.authorId === meId
  const optimistic = comment.id.startsWith("optimistic-")

  const react = useMutation({
    mutationFn: (emoji: string) => api.post(`/api/w/${slug}/reactions`, { commentId: comment.id, emoji }),
    onMutate: (emoji) =>
      cache.patchComment(comment.id, (c) => {
        const group = c.reactions.find((r) => r.emoji === emoji)
        const has = group?.userIds.includes(meId)
        const reactions = group
          ? c.reactions
              .map((r) => (r.emoji === emoji ? { ...r, userIds: has ? r.userIds.filter((u) => u !== meId) : [...r.userIds, meId] } : r))
              .filter((r) => r.userIds.length)
          : [...c.reactions, { emoji, userIds: [meId] }]
        return { ...c, reactions }
      }),
    onError: (err, _v, prev) => {
      cache.restore(prev)
      toast.error(err.message)
    },
    onSettled: () => cache.invalidate(),
  })

  const del = useMutation({
    mutationFn: () => api.delete(`/api/w/${slug}/comments/${comment.id}`),
    onMutate: () => cache.patchComment(comment.id, () => null),
    onError: (err, _v, prev) => {
      cache.restore(prev)
      toast.error(err.message)
    },
    onSettled: () => cache.invalidate(),
  })

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`
    void navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div
      id={`comment-${comment.id}`}
      className={cn(
        "group/comment relative flex scroll-mt-24 gap-3 rounded-lg px-2 transition-colors",
        compact ? "py-0.5" : "pt-2 pb-1",
        highlighted && "bg-brand-soft/60 ring-1 ring-brand/40",
        optimistic && "opacity-60"
      )}
    >
      <div className="w-8 shrink-0">
        {!compact && <UserAvatar name={author?.name} email={author?.email} src={author?.avatarUrl} size="md" />}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{memberName(author, "Former member")}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <time className="font-mono text-[10.5px] text-muted-foreground" dateTime={comment.createdAt}>
                  {threadTime(comment.createdAt)}
                </time>
              </TooltipTrigger>
              <TooltipContent>{fullTime(comment.createdAt)}</TooltipContent>
            </Tooltip>
            {comment.editedAt && <span className="text-[10.5px] text-muted-foreground">(edited)</span>}
          </div>
        )}
        {editing ? (
          <EditForm comment={comment} onDone={() => setEditing(false)} />
        ) : (
          comment.body && (
            <div
              className={cn(
                PROSE,
                "comment-body mt-0.5 w-fit max-w-full rounded-2xl rounded-tl-sm px-3 py-1.5 break-words",
                variant === "comment" ? "bg-amber-100/70 dark:bg-amber-400/10" : "bg-muted/70",
                compact && "rounded-tl-2xl"
              )}
              // Comment HTML is sanitized on the server (strict allowlist, see sanitize.ts).
              dangerouslySetInnerHTML={{ __html: comment.body }}
            />
          )
        )}
        <AttachmentList attachments={comment.attachments} className="mt-1.5" />
        {comment.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {comment.reactions.map((r) => {
              const active = r.userIds.includes(meId)
              const names = r.userIds.map((u) => memberName(member(u))).join(", ")
              return (
                <Tooltip key={r.emoji}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => react.mutate(r.emoji)}
                      aria-pressed={active}
                      aria-label={`${r.emoji} ${r.userIds.length}`}
                      className={cn(
                        "flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors",
                        active ? "border-brand/50 bg-brand-soft text-foreground" : "bg-card text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span className="text-sm leading-none">{r.emoji}</span>
                      {r.userIds.length}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{names}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}
      </div>

      {!editing && !optimistic && (
        <div className="absolute -top-3 right-2 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100 max-md:hidden">
          <EmojiPickerPopover onPick={(emoji) => react.mutate(emoji)} side="top" align="end">
            <Button variant="ghost" size="icon-xs" aria-label="Add reaction">
              <FaceSlightlySmilingPlus />
            </Button>
          </EmojiPickerPopover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Comment actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 /> Copy link
              </DropdownMenuItem>
              {mine && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {!editing && !optimistic && (
        <div className="absolute top-1 right-1 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Comment actions" className="size-8 text-muted-foreground">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {["👍", "❤️", "😂", "🎉", "🙏"].map((e) => (
                <DropdownMenuItem key={e} onSelect={() => react.mutate(e)}>
                  <span className="text-base">{e}</span> React
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 /> Copy link
              </DropdownMenuItem>
              {mine && (
                <>
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {variant === "chat" ? "message" : "comment"}?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => del.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
