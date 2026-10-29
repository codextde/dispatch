"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, MessagesSquare, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/app/user-avatar"
import { useIsMobile } from "@/hooks/use-mobile"
import { api } from "@/lib/api-client"
import { memberName } from "@/lib/inbox/format"
import { inboxKeys } from "@/hooks/inbox/queries"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useInbox } from "./inbox-provider"
import { useI18n } from "@/lib/i18n"

/** Start a direct message (one teammate) or a group chat (two or more). */
export function NewChatDialog() {
  const open = useInboxUI((s) => s.newChatOpen)
  const isMobile = useIsMobile()
  const close = () => inboxUI.set({ newChatOpen: false })
  const { t } = useI18n()
  const title = t("newChat")
  const description = t("newChatDescription")

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => (o ? undefined : close())}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <NewChatForm onDone={close} Footer={DrawerFooter} autoFocus={false} />
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <NewChatForm onDone={close} Footer={DialogFooter} autoFocus />
      </DialogContent>
    </Dialog>
  )
}

function NewChatForm({ onDone, Footer, autoFocus }: { onDone: () => void; Footer: React.ComponentType<React.ComponentProps<"div">>; autoFocus: boolean }) {
  const { slug, members, meId } = useInbox()
  const { t, locale } = useI18n()
  const router = useRouter()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState("")
  const teammates = useMemo(() => members.filter((m) => m.id !== meId), [members, meId])
  const isGroup = selected.length >= 2

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; created: boolean }>(`/api/w/${slug}/chats`, {
        memberIds: selected,
        ...(isGroup && name.trim() ? { name: name.trim() } : {}),
      }),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: inboxKeys.chats(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      onDone()
      router.push(`/w/${slug}/chats/${id}`)
    },
    onError: (err) => toast.error(err.message || t("couldNotStartChat")),
  })

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (selected.length && !create.isPending) create.mutate()
      }}
    >
      <div className="flex min-h-0 flex-col gap-3 px-4 pb-4">
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("selectedTeammates")}>
            {selected.map((id) => {
              const m = members.find((x) => x.id === id)
              return (
                <li key={id}>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-muted/50 pr-1 pl-1 text-[13px]">
                    <UserAvatar name={m?.name} email={m?.email} src={m?.avatarUrl} size="xs" />
                    <span className="max-w-36 truncate">{memberName(m)}</span>
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-label={`${locale === "it" ? "Rimuovi" : "Remove"} ${memberName(m)}`}
                      className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <Command className="rounded-lg! border bg-transparent p-0" loop>
          <CommandInput placeholder={t("searchTeammates")} aria-label={t("searchTeammates")} autoFocus={autoFocus} />
          <CommandList className="max-h-[min(18rem,40dvh)]">
            <CommandEmpty>{t("noTeammatesFound")}</CommandEmpty>
            <CommandGroup>
              {teammates.map((m) => {
                const checked = selected.includes(m.id)
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.name ?? ""} ${m.email} ${m.id}`}
                    onSelect={() => toggle(m.id)}
                    aria-label={`${memberName(m)}${checked ? ", selected" : ""}`}
                    className="gap-2.5 py-2 max-md:py-2.5"
                  >
                    <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                    <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{memberName(m)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.title || m.email}</span>
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        {isGroup && (
          <div className="grid gap-1.5">
            <Label htmlFor="new-chat-name" className="text-xs text-muted-foreground">
              {t("groupName")} <span className="font-normal">({t("optional")})</span>
            </Label>
            <Input id="new-chat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groupChatNamePlaceholder")} maxLength={80} />
          </div>
        )}
      </div>

      <Footer className="m-0 rounded-b-xl">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!selected.length || create.isPending}>
          {create.isPending ? <LoaderCircle className="animate-spin" /> : <MessagesSquare />}
          {isGroup ? t("createGroupChat") : t("openDirectMessage")}
        </Button>
      </Footer>
    </form>
  )
}
