"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AtSign, Bell, BellRing, CheckCheck, MessageSquare, SquareCheckBig, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/app/user-avatar"
import { api } from "@/lib/api-client"
import { relative } from "@/lib/inbox/format"
import type { NotificationItem } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxKeys, useNotifications } from "@/hooks/inbox/queries"
import { useInbox } from "./inbox-provider"

const TYPE_ICON: Record<string, typeof Bell> = {
  mention: AtSign,
  assigned: UserCheck,
  comment: MessageSquare,
  chat: MessageSquare,
  task: SquareCheckBig,
}

export function NotificationsButton({ onNavigate }: { onNavigate?: () => void }) {
  const { slug, member } = useInbox()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const params = useParams<{ box?: string }>()
  const qc = useQueryClient()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useNotifications(slug)
  const items = data?.pages.flatMap((p) => p.items) ?? []
  const unread = data?.pages[0]?.unreadCount ?? 0
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  )

  const mark = useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean; read?: boolean }) => api.post(`/api/w/${slug}/notifications`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: inboxKeys.notifications(slug) })
    },
    onError: (err) => toast.error(err.message),
  })

  const openItem = (n: NotificationItem) => {
    if (!n.readAt) mark.mutate({ ids: [n.id] })
    setOpen(false)
    onNavigate?.()
    if (n.type === "task") {
      router.push(`/w/${slug}/tasks`)
      return
    }
    if (!n.conversationId) return
    const box = n.type === "chat" ? "chats" : params.box && params.box !== "chats" ? decodeURIComponent(params.box) : "inbox"
    router.push(`/w/${slug}/${box}/${n.conversationId}${n.commentId ? `#comment-${n.commentId}` : ""}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative max-lg:size-10" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <Bell />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-0.5 font-mono text-[9px] font-semibold text-brand-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" className="w-[min(24rem,calc(100vw-1rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold tracking-tight">Notifications</p>
          <Button variant="ghost" size="xs" disabled={!unread || mark.isPending} onClick={() => mark.mutate({ all: true })}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        {permission === "default" && (
          <button
            type="button"
            className="flex w-full items-center gap-2 border-b bg-brand-soft/50 px-3 py-2 text-left text-xs hover:bg-brand-soft"
            onClick={async () => setPermission(await Notification.requestPermission())}
          >
            <BellRing className="size-4 shrink-0 text-brand" />
            <span>Enable desktop notifications for mentions and assignments.</span>
          </button>
        )}
        <div className="max-h-[min(28rem,60dvh)] overflow-y-auto">
          {isLoading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <Bell className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">Mentions, assignments and replies show up here.</p>
            </div>
          )}
          <ul>
            {items.map((n) => {
              const actor = member(n.actorId)
              const Icon = TYPE_ICON[n.type] ?? Bell
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted",
                      !n.readAt && "bg-brand-soft/30"
                    )}
                  >
                    <span className="relative mt-0.5 h-fit shrink-0 self-start">
                      <UserAvatar name={actor?.name} email={actor?.email} src={actor?.avatarUrl} size="sm" />
                      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-popover ring-1 ring-border">
                        <Icon className="size-2.5 text-muted-foreground" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("line-clamp-2 text-[13px] leading-snug", !n.readAt && "font-medium")}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">{relative(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
          {hasNextPage && (
            <div className="p-2">
              <Button variant="ghost" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
