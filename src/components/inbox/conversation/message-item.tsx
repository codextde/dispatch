"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CalendarClock, ChevronDown, Ellipsis, Forward, ImageOff, Inbox, Paperclip, Reply, ReplyAll, Send, Undo2 } from "lucide-react"
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
import { useI18n } from "@/lib/i18n"
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

function MessageDirectionBadge({ direction, compact = false }: { direction: ThreadMessage["direction"]; compact?: boolean }) {
  const { t } = useI18n()
  const outbound = direction === "outbound"
  const label = t(outbound ? "messageSent" : "messageReceived")
  const Icon = outbound ? Send : Inbox
  return (
    <span
      title={label}
      role={compact ? "img" : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        outbound ? "border-brand/30 bg-brand-soft text-brand-foreground" : "border-info/30 bg-info/10 text-info"
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {!compact && label}
    </span>
  )
}

function MessageBodyView({ message }: { message: ThreadMessage }) {
  const { t } = useI18n()
  const { slug, bootstrap } = useInbox()
  const pref = (bootstrap.me.preferences as { loadRemoteImages?: "always" | "ask" | "never" }).loadRemoteImages
  const policy = bootstrap.settings.remoteImages
  const [images, setImages] = useState(pref === "always" && policy !== "never")
  const { data, isLoading, isError, refetch } = useMessageBody(slug, message.id, images, message.hasBody)
  if (!message.hasBody) return <p className="text-sm text-muted-foreground italic">{t("messageNoContent")}</p>
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
        {t("messageLoadError")}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => refetch()}>
          {t("messageRetry")}
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {data.hasRemoteImages && !data.imagesLoaded && policy !== "never" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" />
          <span className="flex-1">{t("messageRemoteImagesHidden")}</span>
          <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setImages(true)}>
            {t("messageLoadImages")}
          </button>
        </div>
      )}
      <MessageFrame html={data.html} simple={data.simple} title={t("messageFrom").replace("{name}", participantName({ name: message.fromName, email: message.fromEmail }))} />
    </div>
  )
}

function OutboundStatus({ message, conversationId }: { message: ThreadMessage; conversationId: string }) {
  const { t, locale } = useI18n()
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
      toast.success(message.status === "scheduled" ? t("scheduledCanceledDraft") : t("sendUndone"))
      inboxUI.openComposer(conversationId, draft.mode === "new" ? "reply" : draft.mode, { draft })
    },
    onError: (err) => toast.error(err.message),
  })
  const sendNow = useMutation({
    mutationFn: () => api.post(`/api/w/${slug}/messages/${message.id}/send`),
    onSuccess: () => {
      refresh()
      toast.success(t("sendingNow"))
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
        {message.status === "scheduled" && t("messageScheduledFor").replace("{time}", untilLabel(message.sendAt, locale))}
        {message.status === "queued" && t("messageQueued")}
        {message.status === "sending" && t("messageSending")}
        {message.status === "failed" && `${t("messageFailedToSend")}${message.sendError ? `: ${message.sendError}` : ""}`}
      </span>
      {mine && (message.status === "scheduled" || message.status === "failed") && (
        <Button variant="outline" size="xs" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
          <Send /> {message.status === "failed" ? t("messageRetry") : t("messageSendNow")}
        </Button>
      )}
      {mine && (message.status === "scheduled" || message.status === "queued") && (
        <Button variant="outline" size="xs" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          <Undo2 /> {message.status === "queued" ? t("messageUndo") : t("messageCancel")}
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
  const { t, locale } = useI18n()
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
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-l-4 px-4 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          message.direction === "outbound"
            ? "border-l-brand bg-brand-soft/25 hover:bg-brand-soft/50"
            : "border-l-info bg-info/5 hover:bg-info/10"
        )}
        aria-expanded={false}
      >
        <UserAvatar name={author?.name ?? from.name} email={author?.email ?? from.email} src={author?.avatarUrl} size="sm" />
        <span className="w-36 shrink-0 truncate text-[13px] font-medium max-sm:w-24">{participantName(from)}</span>
        <MessageDirectionBadge direction={message.direction} compact />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{message.snippet}</span>
        {hasFiles && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
        <time className="shrink-0 font-mono text-[11px] text-muted-foreground" dateTime={message.date}>
          {threadTime(message.date, locale)}
        </time>
      </button>
    )
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-l-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        message.direction === "outbound" ? "border-l-brand bg-brand-soft/20" : "border-l-info bg-info/5"
      )}
      aria-label={t("messageFrom").replace("{name}", participantName(from))}
    >
      <header className="flex items-start gap-3 px-4 pt-3 pb-2">
        <button type="button" onClick={onToggle} aria-label={t("messageCollapse")} className="mt-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar name={author?.name ?? from.name} email={author?.email ?? from.email} src={author?.avatarUrl} size="md" />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-semibold">{participantName(from)}</span>
            <MessageDirectionBadge direction={message.direction} />
            {from.name && <span className="truncate text-xs text-muted-foreground">{from.email}</span>}
            {author && <span className="text-xs text-muted-foreground">· {t("messageSentBy")} {memberName(author)}</span>}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex max-w-full items-center gap-0.5 rounded text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">
                  {t("messageTo")} {toLabel || "—"}
                  {recipients.length > 3 && ` +${recipients.length - 3}`}
                </span>
                <ChevronDown className="size-3 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] text-xs">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <AddressList label={t("messageFromLabel")} list={[from]} />
                <AddressList label={t("messageReplyTo")} list={message.replyTo} />
                <AddressList label={t("messageToLabel")} list={message.to} />
                <AddressList label={t("messageCc")} list={message.cc} />
                <AddressList label={t("messageBcc")} list={message.bcc} />
                <dt className="text-muted-foreground">{t("messageDate")}</dt>
                <dd>{fullTime(message.date, locale)}</dd>
                <dt className="text-muted-foreground">{t("messageSubject")}</dt>
                <dd className="break-words">{message.subject || t("convNoSubject")}</dd>
                {acc && (
                  <>
                    <dt className="text-muted-foreground">{t("messageInbox")}</dt>
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
                {threadTime(message.date, locale)}
              </time>
            </TooltipTrigger>
            <TooltipContent>{fullTime(message.date, locale)}</TooltipContent>
          </Tooltip>
          {canReply && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t("reply")} onClick={() => inboxUI.openComposer(conversationId, "reply", { messageId: message.id })}>
                    <Reply />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("reply")}</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t("messageActions")}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "reply", { messageId: message.id })}>
                    <Reply /> {t("reply")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "reply_all", { messageId: message.id })}>
                    <ReplyAll /> {t("replyAll")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => inboxUI.openComposer(conversationId, "forward", { messageId: message.id })}>
                    <Forward /> {t("forward")}
                  </DropdownMenuItem>
                  {message.messageId && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          void navigator.clipboard.writeText(`<${message.messageId}>`)
                          toast.success(t("messageIdCopied"))
                        }}
                      >
                        {t("messageCopyId")}
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
