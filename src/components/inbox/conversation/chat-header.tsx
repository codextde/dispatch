"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Ellipsis, Hash, LogOut, PanelRight, Pencil, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/app/user-avatar"
import { api } from "@/lib/api-client"
import { memberName } from "@/lib/inbox/format"
import type { ConversationDetail } from "@/lib/inbox/types"
import { inboxKeys } from "@/hooks/inbox/queries"
import { useViewers } from "@/hooks/inbox/use-realtime"
import { useInbox } from "../inbox-provider"
import { AssigneePicker } from "../pickers"

/** Header of an internal chat room: name / DM partner, members, rename, add people, leave. */
export function ChatHeader({ conv, onToggleDetails }: { conv: ConversationDetail; onToggleDetails: () => void }) {
  const { slug, member, meId } = useInbox()
  const router = useRouter()
  const qc = useQueryClient()
  const viewers = useViewers(conv.id).filter((v) => v.userId !== meId)
  const isDirect = !conv.subject && conv.chatMemberIds.length === 2
  const other = isDirect ? member(conv.chatMemberIds.find((id) => id !== meId)) : undefined
  const title = isDirect ? memberName(other, "Direct message") : conv.subject || "Group chat"
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState("")
  const [adding, setAdding] = useState(false)

  const update = useMutation({
    mutationFn: (input: { name?: string; addMemberIds?: string[]; removeMemberIds?: string[]; leave?: boolean }) => api.patch(`/api/w/${slug}/chats/${conv.id}`, input),
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, conv.id) })
      void qc.invalidateQueries({ queryKey: inboxKeys.chats(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      if (input.leave) {
        toast.success("You left the chat")
        router.replace(`/w/${slug}/chats`)
      }
    },
    onError: (err) => toast.error(err.message),
  })

  const typing = viewers.filter((v) => v.composing).map((v) => memberName(member(v.userId)).split(" ")[0])

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:px-4">
      <Button variant="ghost" size="icon" className="-ml-1 size-10 md:hidden" aria-label="Back to chats" onClick={() => router.push(`/w/${slug}/chats`)}>
        <ArrowLeft />
      </Button>
      {isDirect ? (
        <UserAvatar name={other?.name} email={other?.email} src={other?.avatarUrl} size="md" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-muted">
          <Hash className="size-4 text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
        <p className="truncate text-xs text-muted-foreground" aria-live="polite">
          {typing.length
            ? `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`
            : isDirect
              ? (other?.title ?? other?.email)
              : `${conv.chatMemberIds.length} members`}
        </p>
      </div>
      {!isDirect && (
        <div className="flex -space-x-1.5 max-sm:hidden">
          {conv.chatMemberIds.slice(0, 5).map((id) => {
            const m = member(id)
            return <UserAvatar key={id} name={m?.name} email={m?.email} src={m?.avatarUrl} size="sm" className="ring-2 ring-card" />
          })}
        </div>
      )}
      {!isDirect && (
        <AssigneePicker
          open={adding}
          onOpenChange={setAdding}
          value={conv.chatMemberIds}
          onToggle={(userId, add) => {
            if (userId === meId) return
            update.mutate(add ? { addMemberIds: [userId] } : { removeMemberIds: [userId] })
          }}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Add or remove people">
            <UserPlus />
          </Button>
        </AssigneePicker>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="max-md:size-10" aria-label="Chat actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isDirect && (
            <DropdownMenuItem
              onSelect={() => {
                setName(conv.subject)
                setRenaming(true)
              }}
            >
              <Pencil /> Rename
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onToggleDetails}>
            <PanelRight /> Details
          </DropdownMenuItem>
          {!isDirect && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => update.mutate({ leave: true })}>
                <LogOut /> Leave chat
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              update.mutate({ name: name.trim() })
              setRenaming(false)
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename chat</DialogTitle>
              <DialogDescription>Everyone in the chat sees the new name.</DialogDescription>
            </DialogHeader>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus aria-label="Chat name" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}
