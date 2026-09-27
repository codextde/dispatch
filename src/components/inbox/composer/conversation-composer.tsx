"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, FilePen, Forward, MessageSquare, Reply, ReplyAll } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { useIsMobile } from "@/hooks/use-mobile"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useViewers } from "@/hooks/inbox/use-realtime"
import { firstName } from "@/lib/inbox/format"
import { replyDefaults } from "@/lib/inbox/reply"
import type { ComposingKind, ConversationThread, DraftInfo, DraftMode, SendResult } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useInbox } from "../inbox-provider"
import { CommentBox } from "./comment-box"
import { EmailComposer } from "./email-composer"
import { draftFromInfo, type EmailDraftState } from "./use-email-draft"

type ReplyMode = Exclude<DraftMode, "new">
const MODE_META: Record<ReplyMode, { label: string; icon: typeof Reply }> = {
  reply: { label: "Reply", icon: Reply },
  reply_all: { label: "Reply all", icon: ReplyAll },
  forward: { label: "Forward", icon: Forward },
}

/**
 * Bottom composer of a conversation: comment bar + reply/forward (desktop),
 * or an action bar with drawers (mobile). Handles r / a / f / c commands.
 */
export function ConversationComposer({
  thread,
  onComposing,
  onSentAndClosed,
  mobileActions,
}: {
  thread: ConversationThread
  onComposing: (kind: ComposingKind) => void
  onSentAndClosed?: () => void
  /** Extra buttons for the mobile action bar (close, assign, more) */
  mobileActions?: React.ReactNode
}) {
  const conv = thread.conversation
  const { bootstrap, meId, ownAddresses, member } = useInbox()
  const isMobile = useIsMobile()
  const [email, setEmail] = useState<{ mode: ReplyMode; key: number; draft?: DraftInfo; messageId?: string } | null>(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const canReply = conv.level !== "read" && conv.kind === "email"

  const accounts = useMemo(() => bootstrap.accounts.filter((a) => a.level !== "read"), [bootstrap.accounts])
  const myDraft = thread.drafts.find((d) => d.authorId === meId) ?? thread.drafts.find((d) => d.isShared)

  // Presence: "writing a comment / reply" while typing, cleared after a pause.
  const composingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activity = useCallback(
    (kind: Exclude<ComposingKind, null>) => {
      onComposing(kind)
      if (composingTimer.current) clearTimeout(composingTimer.current)
      composingTimer.current = setTimeout(() => onComposing(null), 8000)
    },
    [onComposing]
  )
  useEffect(() => () => {
    if (composingTimer.current) clearTimeout(composingTimer.current)
  }, [])

  const openEmail = useCallback(
    (mode: ReplyMode, messageId?: string) => {
      if (!canReply) return
      setCommentOpen(false)
      const draft = mode === "reply" && !messageId ? myDraft : undefined
      setEmail((prev) => ({ mode: draft?.mode === "new" ? "reply" : ((draft?.mode as ReplyMode) ?? mode), key: (prev?.key ?? 0) + 1, draft, messageId }))
    },
    [canReply, myDraft]
  )

  // Keyboard / external commands (r, a, f, c; undo send re-opens the draft).
  const command = useInboxUI((s) => (s.composer?.conversationId === conv.id ? s.composer : null))
  const [handledNonce, setHandledNonce] = useState<number | null>(null)
  const [focusComment, setFocusComment] = useState(0)
  if (command && command.nonce !== handledNonce) {
    setHandledNonce(command.nonce)
    if (command.mode === "comment") {
      setEmail(null)
      setCommentOpen(true)
      setFocusComment(command.nonce)
    } else if (command.mode !== "new" && canReply) {
      const draft = command.messageId
        ? undefined
        : (thread.drafts.find((d) => d.authorId === meId && d.mode === command.mode) ?? (command.mode === "reply" ? myDraft : undefined))
      setCommentOpen(false)
      setEmail({ mode: command.mode, key: command.nonce, draft, messageId: command.messageId })
    }
  }
  useEffect(() => {
    if (command) inboxUI.set({ composer: null })
  }, [command])
  useEffect(() => {
    if (!focusComment) return
    const raf = requestAnimationFrame(() => (document.querySelector('[data-comment-box] [contenteditable="true"]') as HTMLElement | null)?.focus())
    return () => cancelAnimationFrame(raf)
  }, [focusComment])

  const initial = useMemo<EmailDraftState | null>(() => {
    if (!email) return null
    const sigFor = (accountId: string | null) => bootstrap.accounts.find((a) => a.id === accountId)?.defaultSignatureId ?? null
    if (email.draft) return draftFromInfo(email.draft, sigFor(email.draft.accountId))
    const defaults = replyDefaults(thread, email.mode, accounts, ownAddresses, email.messageId)
    return {
      id: null,
      version: 0,
      conversationId: conv.id,
      mode: email.mode,
      replyToMessageId: defaults.replyToMessageId,
      accountId: defaults.accountId,
      fromEmail: defaults.fromEmail,
      to: defaults.to,
      cc: defaults.cc,
      bcc: [],
      subject: email.mode === "forward" ? defaults.subject : "",
      body: "",
      signatureId: sigFor(defaults.accountId),
      isShared: false,
    }
    // Only recompute when a composer is (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.key])

  const switchMode = (mode: ReplyMode) => {
    if (!email || mode === email.mode) return
    setEmail((prev) => ({ mode, key: (prev?.key ?? 0) + 1, messageId: prev?.messageId }))
  }

  const onSent = (_result: SendResult, opts: { close: boolean }) => {
    setEmail(null)
    onComposing(null)
    if (opts.close) onSentAndClosed?.()
  }

  const serverDraft = email?.draft ? thread.drafts.find((d) => d.id === email.draft!.id) : undefined
  const viewers = useViewers(conv.id)
  const coEditors = useMemo(() => viewers.filter((v) => v.composing === "reply" && v.userId !== meId).map((v) => v.userId), [viewers, meId])
  const contact = thread.conversation.participants[0] ?? null

  if (conv.kind === "chat") {
    return (
      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6" data-comment-box>
        <CommentBox conversationId={conv.id} variant="chat" placeholder="Message…" onActivity={() => activity("comment")} autoFocus={!isMobile} />
      </div>
    )
  }

  const modeSwitcher = email && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-1 h-7 gap-1 px-1.5 text-[13px] font-medium">
          {(() => {
            const Icon = MODE_META[email.mode].icon
            return <Icon className="size-3.5" />
          })()}
          {MODE_META[email.mode].label}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(MODE_META) as ReplyMode[]).map((m) => {
          const Icon = MODE_META[m].icon
          return (
            <DropdownMenuItem key={m} onSelect={() => switchMode(m)}>
              <Icon /> {MODE_META[m].label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const emailComposer = email && initial && (
    <EmailComposer
      key={email.key}
      initial={initial}
      initialAttachments={email.draft?.attachments}
      serverDraft={serverDraft}
      accounts={accounts}
      contact={contact}
      header={modeSwitcher}
      coEditors={coEditors}
      variant={isMobile ? "dialog" : "inline"}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
      onClose={() => {
        setEmail(null)
        onComposing(null)
      }}
      onSent={onSent}
      onActivity={() => activity("reply")}
    />
  )

  if (isMobile) {
    return (
      <>
        <div className="flex shrink-0 items-center gap-1 border-t bg-card px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {canReply && (
            <Button variant="ghost" className="h-11 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => openEmail("reply")}>
              {myDraft ? <FilePen className="size-5 text-red-500" /> : <Reply className="size-5" />}
              {myDraft ? "Draft" : "Reply"}
            </Button>
          )}
          <Button variant="ghost" className="h-11 flex-1 flex-col gap-0.5 px-1 text-[11px]" onClick={() => setCommentOpen(true)}>
            <MessageSquare className="size-5" />
            Comment
          </Button>
          {mobileActions}
        </div>
        <Drawer open={!!email} onOpenChange={(o) => !o && setEmail(null)} repositionInputs={false}>
          <DrawerContent className="h-[94dvh] max-h-[94dvh] p-0 data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
            <DrawerTitle className="sr-only">{email ? MODE_META[email.mode].label : "Reply"}</DrawerTitle>
            <DrawerDescription className="sr-only">Write an email reply</DrawerDescription>
            <div className="min-h-0 flex-1">{emailComposer}</div>
          </DrawerContent>
        </Drawer>
        <Drawer open={commentOpen} onOpenChange={setCommentOpen} repositionInputs={false}>
          <DrawerContent className="p-0">
            <DrawerTitle className="px-4 pt-2 text-sm">Internal comment</DrawerTitle>
            <DrawerDescription className="px-4 text-xs">Only teammates can see comments. @mention to notify.</DrawerDescription>
            <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-comment-box>
              <CommentBox conversationId={conv.id} variant="sheet" autoFocus onActivity={() => activity("comment")} onSent={() => setCommentOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  if (emailComposer) {
    return <div className="shrink-0 px-4 pt-1 pb-4 md:px-6">{emailComposer}</div>
  }

  return (
    <div className="shrink-0 px-4 pt-1 pb-4 md:px-6">
      <div className="flex items-end gap-2">
        <div className={cn("min-w-0 flex-1")} data-comment-box>
          <CommentBox conversationId={conv.id} onActivity={() => activity("comment")} autoFocus={commentOpen} onEscape={() => (document.activeElement as HTMLElement | null)?.blur()} />
        </div>
        {canReply && (
          <div className="flex shrink-0 items-center gap-1 pb-1">
            {myDraft ? (
              <Button variant="outline" size="sm" onClick={() => openEmail("reply")} className="border-red-500/30 text-red-600 hover:text-red-600 dark:text-red-400">
                <FilePen /> {myDraft.authorId === meId ? "Draft" : `${firstName(member(myDraft.authorId))}'s draft`}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => openEmail("reply")}>
                <Reply /> Reply <Kbd className="ml-0.5 max-lg:hidden">R</Kbd>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More reply options">
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onSelect={() => openEmail("reply_all")}>
                  <ReplyAll /> Reply all <span className="ml-auto text-xs text-muted-foreground">A</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openEmail("forward")}>
                  <Forward /> Forward <span className="ml-auto text-xs text-muted-foreground">F</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  )
}
