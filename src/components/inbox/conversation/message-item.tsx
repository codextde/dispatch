"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CalendarClock, ChevronDown, Ellipsis, Forward, ImageOff, Paperclip, Reply, ReplyAll, Send, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { api } from "@/lib/api-client"
import { formatAddress, fullTime, memberName, participantName, threadTime, untilLabel } from "@/lib/inbox/format"
import type { DraftInfo, Participant, ThreadMessage } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxKeys, useMessageBody } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { AttachmentList } from "../attachments"
import { useInbox } from "../inbox-provider"
import { MessageFrame } from "./message-frame"

function AddressList({ label, list }: { label: string; list: Participant[] }) {
  if (!list.length) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{list.map(formatAddress).join(", ")}</dd>
    </>
  )
}

function MessageBodyView({ message }: { message: ThreadMessage }) {
  const { slug, bootstrap } = useInbox()
  const pref = (bootstrap.me.preferences as { loadRemoteImages?: "always" | "ask" | "never" }).loadRemoteImages
  const policy = bootstrap.settings.remoteImages
  const [images, setImages] = useState(pref === "always" && policy !== "never")
  const { data, isLoading, isError, refetch } = useMessageBody(slug, message.id, images, message.hasBody)
  if (!message.hasBody) return <p className="text-sm text-muted-foreground italic">This message has no content.</p>
  if (isLoading) {
    return (
      <div className="space-y-2 py-1">
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Could not load this message.
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {data.hasRemoteImages && !data.imagesLoaded && policy !== "never" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" />
          <span className="flex-1">Remote images are hidden to protect your privacy.</span>
          <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setImages(true)}>
            Load images
          </button>
        </div>
      )}
      <MessageFrame html={data.html} simple={data.simple} title={`Message from ${participantName({ name: message.fromName, email: message.fromEmail })}`} />
    </div>
  )
}

function OutboundStatus({ message, conversationId }: { message: ThreadMessage; conversationId: string }) {
  const { slug, meId } = useInbox()
  const qc = useQueryClient()
  const mine = message.authorId === meId
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, conversationId) })
    void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
    void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
  }
  const cancel = useMutation({
    mutationFn: () => api.post<DraftInfo>(`/api/w/${slug}/messages/${message.id}/cancel`),
    onSuccess: (draft) => {
      refresh()
      toast.success(message.status === "scheduled" ? "Scheduled message canceled — it's a draft again" : "Sending undone")
      inboxUI.openComposer(conversationId, draft.mode === "new" ? "reply" : draft.mode, { draft })
    },
    onError: (err) => toast.error(err.message),
  })
  const sendNow = useMutation({
    mutationFn: () => api.post(`/api/w/${slug}/messages/${message.id}/send`),
    onSuccess: () => {
      refresh()
      toast.success("Sending now")
    },
    onError: (err) => toast.error(err.message),
  })

  if (message.status === "sent" || message.status === "received") return null
  const tone =
    message.status === "failed"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : message.status === "scheduled"
        ? "border-info/30 bg-info/10 text-foreground"
        : "border-border bg-muted/60 text-muted-foreground"
  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs", tone)}>
      {message.status === "failed" ? <AlertCircle className="size-3.5" /> : message.status === "scheduled" ? <CalendarClock className="size-3.5" /> : <Send className="size-3.5" />}
      <span className="flex-1">
        {message.status === "scheduled" && `Scheduled for ${untilLabel(message.sendAt)}`}
        {message.status === "queued" && "Queued for sending…"}
        {message.status === "sending" && "Sending…"}
        {message.status === "failed" && `Failed to send${message.sendError ? `: ${message.sendError}` : ""}`}
      </span>
      {mine && (message.status === "scheduled" || message.status === "failed") && (
        <Button variant="outline" size="xs" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
          <Send /> {message.status === "failed" ? "Retry" : "Send now"}
        </Button>
      )}
      {mine && (message.status === "scheduled" || message.status === "queued") && (
        <Button variant="outline" size="xs" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          <Undo2 /> {message.status === "queued" ? "Undo" : "Cancel"}
        </Button>
      )}
    </div>
  )
}

export function MessageItem({
  message,
  conversationId,
  expanded,
  onToggle,
  canReply,
}: {
  message: ThreadMessage
  conversationId: string
  expanded: boolean
  onToggle: () => void
  canReply: boolean
}) {
  const { account, member, ownAddresses } = useInbox()
  const from: Participant = { name: message.fromName, email: message.fromEmail }
  const author = message.direction === "outbound" && message.authorId ? member(message.authorId) : undefined
  const acc = account(message.accountId)
  const recipients = [...message.to, ...message.cc]
  const toLabel = recipients
    .slice(0, 3)
    .map((p) => (ownAddresses.has(p.email.toLowerCase()) ? (acc && p.email.toLowerCase() === acc.email.toLowerCase() ? acc.name : p.email) : p.name || p.email))
    .join(", ")
  const hasFiles = message.attachments.some((a) => !a.isInline)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={false}
      >
        <UserAvatar name={author?.name ?? from.name} email={author?.email ?? from.email} src={author?.avatarUrl} size="sm" />
        <span className="w-36 shrink-0 truncate text-[13px] font-medium max-sm:w-24">{participantName(from)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{message.snippet}</span>
        {hasFiles && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
        <time className="shrink-0 font-mono text-[11px] text-muted-foreground" dateTime={message.date}>
          {threadTime(message.date)}
        </time>
      </button>
    )
  }

  return (
    <article className="rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]" aria-label={`Message from ${participantName(from)}`}>
      <header className="flex items-start gap-3 px-4 pt-3 pb-2">
        <button type="button" onClick={onToggle} aria-label="Collapse message" className="mt-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar name={author?.name ?? from.name} email={author?.email ?? from.email} src={author?.avatarUrl} size="md" />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-semibold">{participantName(from)}</span>
            {from.name && <span className="truncate text-xs text-muted-foreground">{from.email}</span>}
            {author && <span className="text-xs text-muted-foreground">· sent by {memberName(author)}</span>}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex max-w-full items-center gap-0.5 rounded text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">
                  to {toLabel || "—"}
                  {recipients.length > 3 && ` +${recipients.length - 3}`}
                </span>
                <ChevronDown className="size-3 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] text-xs">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <AddressList label="From" list={[from]} />
                <AddressList label="Reply-To" list={message.replyTo} />
                <AddressList label="To" list={message.to} />
                <AddressList label="Cc" list={message.cc} />
                <AddressList label="Bcc" list={message.bcc} />
                <dt className="text-muted-foreground">Date</dt>
                <dd>{fullTime(message.date)}</dd>
                <dt className="text-muted-foreground">Subject</dt>
                <dd className="break-words">{message.subject || "(no subject)"}</dd>
                {acc && (
                  <>
                    <dt className="text-muted-foreground">Inbox</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                      {acc.name}
                    </dd>
                  </>
                )}
              </dl>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <time className="font-mono text-[11px] text-muted-foreground" dateTime={message.date}>
                {threadTime(message.date)}
              </time>
            </TooltipTrigger>
            <TooltipContent>{fullTime(message.date)}</TooltipContent>
          </Tooltip>
          {canReply && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Reply" onClick={() => inboxUI.openComposer(conversationId, "reply", { messageId: message.id })}>
                    <Reply />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Message actions">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "reply", { messageId: message.id })}>
                    <Reply /> Reply
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "reply_all", { messageId: message.id })}>
                    <ReplyAll /> Reply all
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "forward", { messageId: message.id })}>
                    <Forward /> Forward
                  </DropdownMenuItem>
                  {message.messageId && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          void navigator.clipboard.writeText(`<${message.messageId}>`)
                          toast.success("Message-ID copied")
                        }}
                      >
                        Copy Message-ID
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </header>
      <div className="px-4 pb-4">
        <MessageBodyView message={message} />
        <AttachmentList attachments={message.attachments} className="mt-3" />
        {message.direction === "outbound" && <OutboundStatus message={message} conversationId={conversationId} />}
      </div>
    </article>
  )
}
