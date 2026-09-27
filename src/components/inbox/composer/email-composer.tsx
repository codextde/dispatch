"use client"

import { useEffect, useMemo, useState } from "react"
import { Maximize2, Minimize2, Trash2, Users, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useOrg } from "@/components/app/org-provider"
import { AiAssist } from "@/components/ai/ai-assist"
import { firstName, memberName, relative } from "@/lib/inbox/format"
import { purify } from "@/lib/inbox/purify"
import { renderTemplate } from "@/lib/inbox/templates"
import type { AccountSummary, AttachmentInfo, DraftInfo, Participant, SendResult } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { UploadChips } from "../attachments"
import { useInbox } from "../inbox-provider"
import { AttachButton, FromSelect, ResponsePicker, SendButton, SignatureSelect } from "./composer-parts"
import { EditorContent, EditorToolbar, isEditorEmpty, useEmailEditor } from "./editor"
import { RecipientInput } from "./recipient-input"
import { useEmailDraft, type EmailDraftState } from "./use-email-draft"
import { useUploads } from "./use-uploads"

export type EmailComposerProps = {
  initial: EmailDraftState
  initialAttachments?: AttachmentInfo[]
  /** Latest server copy of this draft (shared drafts edited elsewhere) */
  serverDraft?: DraftInfo
  /** Accounts the user can send from */
  accounts: AccountSummary[]
  /** Customer for {{contact.*}} variables in canned responses */
  contact?: Participant | null
  /** Rendered above the address fields (e.g. reply mode switcher) */
  header?: React.ReactNode
  /** Other people currently writing a reply in this conversation */
  coEditors?: string[]
  variant?: "inline" | "dialog"
  autoFocus?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
  onClose: () => void
  onSent: (result: SendResult, opts: { close: boolean }) => void
  onDiscarded?: () => void
  onActivity?: () => void
  /** Called when the mode changes recipients (reply ↔ reply all ↔ forward) */
  onDraftChange?: (draft: EmailDraftState) => void
}

export function EmailComposer({
  initial,
  initialAttachments = [],
  serverDraft,
  accounts,
  contact,
  header,
  coEditors = [],
  variant = "inline",
  autoFocus = true,
  expanded,
  onToggleExpanded,
  onClose,
  onSent,
  onDiscarded,
  onActivity,
  onDraftChange,
}: EmailComposerProps) {
  const { slug, bootstrap, member, meId } = useInbox()
  const { org } = useOrg()
  const uploads = useUploads(slug, bootstrap.settings.maxAttachmentMb, initialAttachments)
  const [showCc, setShowCc] = useState(initial.cc.length > 0)
  const [showBcc, setShowBcc] = useState(initial.bcc.length > 0)

  const editor = useEmailEditor({
    content: initial.body,
    placeholder: initial.mode === "forward" ? "Add a note…" : initial.mode === "new" ? "Write your message…" : "Write your reply…",
    autofocus: autoFocus && initial.mode !== "new" && initial.mode !== "forward",
    onChange: (html, ed) => {
      d.update({ body: isEditorEmpty(ed) ? "" : html })
      onActivity?.()
    },
    onSubmit: ({ close }) => void d.send({ close }),
    onFiles: (files) => uploads.add(files),
  })

  const d = useEmailDraft({
    initial,
    attachmentIds: uploads.ids,
    onRemoteContent: (body) => editor?.commands.setContent(body, { emitUpdate: false }),
    onResetAttachments: (info) => uploads.reset(info.attachments),
    onSent: (result, opts) => {
      editor?.commands.clearContent(false)
      uploads.reset()
      onSent(result, opts)
    },
  })
  const { draft, update, syncRemote } = d

  useEffect(() => syncRemote(serverDraft), [serverDraft, syncRemote])
  useEffect(() => onDraftChange?.(draft), [draft, onDraftChange])

  // Escape closes the composer (the draft is kept).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[role="dialog"]') && variant === "inline") return
      if (!target?.closest("[data-email-composer]")) return
      e.preventDefault()
      void d.save()
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [d, onClose, variant])

  const insertResponse = (body: string, subject: string | null) => {
    const me = bootstrap.me
    const html = renderTemplate(body, { contact, user: { name: me.name, email: me.email, title: me.title }, org: { name: org.name } })
    editor?.chain().focus().insertContent(html).run()
    if (subject && !draft.subject.trim() && (draft.mode === "new" || draft.mode === "forward")) update({ subject })
  }

  const editorsLabel = useMemo(() => {
    const names = coEditors.filter((id) => id !== meId).map((id) => firstName(member(id)))
    if (!names.length) return null
    return `${names.join(", ")} ${names.length === 1 ? "is" : "are"} also writing`
  }, [coEditors, meId, member])
  const lastEditor = draft.isShared && serverDraft?.lastEditedBy && serverDraft.lastEditedBy !== meId ? member(serverDraft.lastEditedBy) : undefined
  const canSend = !d.sending && !uploads.uploading

  return (
    <div
      data-email-composer
      className={cn(
        "flex min-h-0 flex-col bg-card",
        variant === "inline" && "rounded-xl border shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
        variant === "dialog" && "h-full"
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        {header}
        <div className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
          <span className="shrink-0 text-muted-foreground">From</span>
          <FromSelect
            accounts={accounts}
            accountId={draft.accountId}
            fromEmail={draft.fromEmail}
            onChange={(accountId, fromEmail) => update({ accountId, fromEmail }, { touch: false })}
          />
        </div>
        {editorsLabel && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-500" /> {editorsLabel}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={draft.isShared}
              onPressedChange={(v) => {
                if (draft.id && serverDraft && serverDraft.authorId !== meId) return
                update({ isShared: v })
                toast(v ? "Draft shared with teammates" : "Draft is private again")
              }}
              aria-label="Share draft with teammates"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Users className="size-3.5" />
              <span className="max-sm:hidden">{draft.isShared ? "Shared" : "Share"}</span>
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Shared drafts can be edited by teammates</TooltipContent>
        </Tooltip>
        {onToggleExpanded && (
          <Button variant="ghost" size="icon-sm" className="max-md:hidden" onClick={onToggleExpanded} aria-label={expanded ? "Shrink composer" : "Expand composer"}>
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            void d.save()
            onClose()
          }}
          aria-label="Close composer (draft is saved)"
        >
          <X />
        </Button>
      </div>

      <RecipientInput
        label="To"
        value={draft.to}
        onChange={(to) => update({ to })}
        autoFocus={autoFocus && (draft.mode === "new" || draft.mode === "forward")}
        trailing={
          <span className="mt-0.5 flex shrink-0 gap-1 text-xs text-muted-foreground">
            {!showCc && (
              <button type="button" className="rounded px-1 hover:text-foreground" onClick={() => setShowCc(true)}>
                Cc
              </button>
            )}
            {!showBcc && (
              <button type="button" className="rounded px-1 hover:text-foreground" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            )}
          </span>
        }
      />
      {showCc && <RecipientInput label="Cc" value={draft.cc} onChange={(cc) => update({ cc })} />}
      {showBcc && <RecipientInput label="Bcc" value={draft.bcc} onChange={(bcc) => update({ bcc })} />}
      {(draft.mode === "new" || draft.mode === "forward") && (
        <div className="flex items-center gap-2 border-b px-3">
          <label htmlFor="composer-subject" className="w-8 shrink-0 text-[13px] text-muted-foreground">
            Subj.
          </label>
          <Input
            id="composer-subject"
            value={draft.subject}
            onChange={(e) => update({ subject: e.target.value })}
            placeholder="Subject"
            className="h-9 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overflow-y-auto", variant === "inline" && (expanded ? "max-h-[60dvh]" : "max-h-[34dvh]"))}>
        <EditorContent editor={editor} />
        {draft.signatureId && (
          <div
            className="mx-3 mb-2 border-t border-dashed pt-2 text-[12.5px] text-muted-foreground [&_img]:max-h-16 [&_p]:my-0"
            dangerouslySetInnerHTML={{ __html: purify(d.signatureHtml(draft.signatureId).replace(/^<div[^>]*><br>/, "<div>")) }}
          />
        )}
        {draft.mode !== "new" && (
          <p className="px-3 pb-2 text-[11.5px] text-muted-foreground">
            {draft.mode === "forward" ? "The original message and its attachments are included below your note." : "The previous message will be quoted below your reply."}
          </p>
        )}
      </div>

      {uploads.items.length > 0 && (
        <div className="border-t px-3 py-2">
          <UploadChips items={uploads.items} onRemove={uploads.remove} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <EditorToolbar editor={editor} className="max-md:hidden" />
        <span className="mx-1 h-4 w-px bg-border max-md:hidden" aria-hidden />
        <AttachButton onFiles={uploads.add} />
        <ResponsePicker onPick={(r) => insertResponse(r.body, r.subject)} />
        <AiAssist
          slug={slug}
          conversationId={draft.conversationId}
          getDraftText={() => editor?.getText() ?? ""}
          onInsert={(html) => editor?.chain().focus().insertContent(html).run()}
          onReplace={(html) => editor?.commands.setContent(html, { emitUpdate: true })}
        />
        <SignatureSelect value={draft.signatureId} accountId={draft.accountId} onChange={(signatureId) => update({ signatureId })} />
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[10.5px] text-muted-foreground max-sm:hidden" aria-live="polite">
            {d.saving ? "Saving…" : lastEditor ? `Edited by ${memberName(lastEditor)}` : d.lastSavedAt ? `Saved ${relative(d.lastSavedAt.toISOString())}` : ""}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Discard draft"
                onClick={async () => {
                  try {
                    await d.discard()
                    editor?.commands.clearContent(false)
                    uploads.reset()
                    onDiscarded?.()
                    onClose()
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not discard the draft")
                  }
                }}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Discard draft</TooltipContent>
          </Tooltip>
          <SendButton onSend={(opts) => void d.send(opts)} disabled={!canSend} pending={d.sending} allowClose={draft.mode !== "new"} />
        </span>
      </div>
    </div>
  )
}
