"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowUp, AtSign, FaceSlightlySmiling } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api-client"
import type { ConversationThread, ThreadComment } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxKeys } from "@/hooks/inbox/queries"
import { UploadChips } from "../attachments"
import { EmojiPickerPopover } from "../emoji-picker"
import { useInbox } from "../inbox-provider"
import { AttachButton } from "./composer-parts"
import { EditorContent, isEditorEmpty, useCommentEditor } from "./editor"
import { useUploads } from "./use-uploads"

const storageKey = (id: string) => `dispatch:comment-draft:${id}`

function readStored(id: string) {
  try {
    return window.localStorage.getItem(storageKey(id)) ?? ""
  } catch {
    return ""
  }
}

/**
 * Internal comment / chat message input: Tiptap with @mentions, Enter to
 * send (Shift+Enter for a new line), attachments and emoji. Unsent text is
 * kept per conversation in localStorage.
 */
export function CommentBox({
  conversationId,
  placeholder,
  autoFocus,
  variant = "bar",
  onActivity,
  onSent,
  onEscape,
}: {
  conversationId: string
  placeholder?: string
  autoFocus?: boolean
  variant?: "bar" | "chat" | "sheet"
  onActivity?: () => void
  onSent?: () => void
  onEscape?: () => void
}) {
  const { slug, members, meId, bootstrap } = useInbox()
  const qc = useQueryClient()
  const uploads = useUploads(slug, bootstrap.settings.maxAttachmentMb)
  const [empty, setEmpty] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const send = useMutation({
    mutationFn: (input: { body: string; attachmentIds: string[] }) => api.post<ThreadComment>(`/api/w/${slug}/conversations/${conversationId}/comments`, input),
    onMutate: async (input) => {
      const key = inboxKeys.thread(slug, conversationId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ConversationThread>(key)
      if (prev) {
        const optimistic: ThreadComment = {
          id: `optimistic-${Date.now()}`,
          authorId: meId,
          body: input.body,
          mentions: [],
          parentId: null,
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          reactions: [],
          attachments: uploads.items.filter((i) => i.attachment).map((i) => i.attachment!),
        }
        qc.setQueryData<ConversationThread>(key, { ...prev, comments: [...prev.comments, optimistic] })
      }
      return { prev }
    },
    onError: (err, input, ctx) => {
      if (ctx?.prev) qc.setQueryData(inboxKeys.thread(slug, conversationId), ctx.prev)
      editor?.commands.setContent(input.body)
      setEmpty(false)
      toast.error(err.message || "Comment not sent")
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, conversationId) })
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.chats(slug) })
    },
  })

  const submit = () => {
    if (!editor || uploads.uploading) return
    if (isEditorEmpty(editor) && !uploads.ids.length) return
    const body = isEditorEmpty(editor) ? "" : editor.getHTML()
    send.mutate({ body, attachmentIds: uploads.ids })
    editor.commands.clearContent()
    uploads.reset()
    setEmpty(true)
    try {
      window.localStorage.removeItem(storageKey(conversationId))
    } catch {
      /* ignore */
    }
    onSent?.()
  }

  const [restored] = useState(() => (typeof window === "undefined" ? "" : readStored(conversationId)))
  const editor = useCommentEditor({
    members,
    placeholder: placeholder ?? "Comment or @mention…",
    content: restored,
    onReady: (ed) => setEmpty(isEditorEmpty(ed)),
    autofocus: autoFocus,
    onSubmit: submit,
    onFiles: uploads.add,
    onEscape,
    onChange: (ed) => {
      const isEmpty = isEditorEmpty(ed)
      setEmpty(isEmpty)
      onActivity?.()
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        try {
          if (isEmpty) window.localStorage.removeItem(storageKey(conversationId))
          else window.localStorage.setItem(storageKey(conversationId), ed.getHTML())
        } catch {
          /* ignore */
        }
      }, 400)
    },
  })

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const canSend = (!empty || uploads.ids.length > 0) && !uploads.uploading

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-shadow focus-within:border-foreground/20 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_18%,transparent)]",
        variant === "bar" && "bg-amber-50/60 dark:bg-amber-400/[0.04]",
        variant === "sheet" && "border-0 bg-transparent focus-within:shadow-none"
      )}
    >
      {uploads.items.length > 0 && (
        <div className="px-3 pt-2">
          <UploadChips items={uploads.items} onRemove={uploads.remove} />
        </div>
      )}
      <div className="flex items-end gap-1 py-1.5 pr-1.5 pl-3">
        <div className="min-w-0 flex-1 py-1" onClick={() => editor?.commands.focus()}>
          <EditorContent editor={editor} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="max-md:size-9"
                aria-label="Mention a teammate"
                onClick={() => editor?.chain().focus().insertContent(editor.isEmpty || /\s$/.test(editor.getText()) ? "@" : " @").run()}
              >
                <AtSign />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mention</TooltipContent>
          </Tooltip>
          <EmojiPickerPopover onPick={(emoji) => editor?.chain().focus().insertContent(emoji).run()} side="top" align="end">
            <Button variant="ghost" size="icon-sm" className="max-md:size-9" aria-label="Insert emoji">
              <FaceSlightlySmiling />
            </Button>
          </EmojiPickerPopover>
          <AttachButton onFiles={uploads.add} />
          <Button size="icon-sm" className="ml-0.5 rounded-lg max-md:size-9" disabled={!canSend} onClick={submit} aria-label={variant === "chat" ? "Send message" : "Send comment"}>
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  )
}
