"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Contact,
  Hash,
  Keyboard,
  LoaderCircle,
  Mail,
  MessagesSquare,
  Moon,
  Search,
  Settings,
  SquareCheckBig,
  SquarePen,
  Sun,
  Tag,
  TextSearch,
  Users,
  type LucideIcon,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { UserAvatar } from "@/components/app/user-avatar"
import { useOrg } from "@/components/app/org-provider"
import { STATIC_BOXES, STATIC_BOX_META, type StaticBox } from "@/lib/inbox/boxes"
import { listTime, memberName, participantName, shortName } from "@/lib/inbox/format"
import { SEARCH_HINTS } from "@/lib/inbox/search-query"
import type { ConversationListItem } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useChats, useSearch } from "@/hooks/inbox/queries"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { shortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { STATIC_BOX_ICONS } from "./box-info"
import { useInbox } from "./inbox-provider"

type StaticItem = {
  id: string
  label: string
  keywords?: string
  icon?: LucideIcon
  color?: string
  avatar?: { name: string | null; email: string; avatarUrl: string | null }
  shortcut?: string
  run: () => void
}

const BOX_SHORTCUTS: Partial<Record<StaticBox, string>> = {
  inbox: "g i",
  assigned: "g a",
  starred: "g s",
  drafts: "g d",
  mentions: "g m",
  chats: "g c",
}

const matches = (item: StaticItem, q: string) => !q || `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q)

function Shortcut({ combo }: { combo: string }) {
  return <CommandShortcut className="font-mono text-[11px] tracking-normal">{shortcutLabel(combo).join(" ")}</CommandShortcut>
}

function ItemIcon({ item }: { item: StaticItem }) {
  if (item.avatar) return <UserAvatar name={item.avatar.name} email={item.avatar.email} src={item.avatar.avatarUrl} size="xs" className="size-4 text-[8px]" />
  if (item.color)
    return (
      <span className="flex size-4 items-center justify-center" aria-hidden>
        <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
      </span>
    )
  const Icon = item.icon
  return Icon ? <Icon className="text-muted-foreground" /> : null
}

function ResultRow({ item, meId }: { item: ConversationListItem; meId: string }) {
  const { member } = useInbox()
  const isChat = item.kind === "chat"
  const directMember = isChat && !item.subject ? member(item.chatMemberIds.find((id) => id !== meId)) : undefined
  const who = isChat
    ? item.subject || memberName(directMember, "Direct message")
    : item.participants.length
      ? item.participants
          .slice(0, 2)
          .map((p) => (item.participants.length > 1 ? shortName(p) : participantName(p)))
          .join(", ")
      : participantName(item.lastFrom)
  return (
    <>
      <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {isChat ? <MessagesSquare className="text-muted-foreground" /> : <Mail className="text-muted-foreground" />}
        {item.unread && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px]", item.unread && "font-medium")}>
          {isChat ? who : item.subject || <span className="text-muted-foreground italic">(no subject)</span>}
        </span>
        {!isChat && who && <span className="block truncate text-xs text-muted-foreground">{who}</span>}
      </span>
      {item.status === "closed" && !isChat && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground uppercase">Closed</span>
      )}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{listTime(item.lastActivityAt)}</span>
    </>
  )
}

/** ⌘K: search conversations, jump to boxes/teams/inboxes/labels/chats, run actions. */
export function CommandPalette() {
  const { slug, meId, bootstrap, member } = useInbox()
  const { can } = useOrg()
  const router = useRouter()
  const params = useParams<{ box?: string }>()
  const { resolvedTheme, setTheme } = useTheme()
  const open = useInboxUI((s) => s.paletteOpen)
  const [query, setQuery] = useState(() => inboxUI.get().paletteQuery)
  const [debounced, setDebounced] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: chats = bootstrap.chats } = useChats(slug, bootstrap.chats)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(t)
  }, [query])

  const q = query.trim()
  const lower = q.toLowerCase()
  const searchable = debounced.trim().length >= 2
  const search = useSearch(slug, debounced)
  // useSearch's inferred data type includes the placeholder function; narrow it.
  const found: ConversationListItem[] = search.data ?? []
  const results = searchable && q.length >= 2 ? found : []

  const close = () => inboxUI.set({ paletteOpen: false })
  const run = (fn: () => void) => {
    close()
    fn()
  }
  const base = `/w/${slug}`
  const currentBox = params.box ? decodeURIComponent(params.box) : ""
  const listBox = currentBox && currentBox !== "search" && currentBox !== "chats" ? currentBox : "all"

  const openConversation = (item: ConversationListItem) =>
    run(() => router.push(item.kind === "chat" ? `${base}/chats/${item.id}` : `${base}/${listBox}/${item.id}`))
  const searchAll = () => run(() => router.push(`${base}/search?q=${encodeURIComponent(q)}`))

  const goTo = useMemo<StaticItem[]>(() => {
    const items: StaticItem[] = STATIC_BOXES.filter((b) => b !== "search").map((b) => ({
      id: `box:${b}`,
      label: STATIC_BOX_META[b].title,
      keywords: `${b} ${STATIC_BOX_META[b].description}`,
      icon: STATIC_BOX_ICONS[b],
      shortcut: BOX_SHORTCUTS[b],
      run: () => router.push(`${base}/${b}`),
    }))
    for (const t of bootstrap.teams) {
      if (!t.isMember && !can("conversations.view_all")) continue
      items.push({ id: `team:${t.id}`, label: t.name, keywords: "team", color: t.color, run: () => router.push(`${base}/team.${t.id}`) })
    }
    for (const a of bootstrap.accounts) {
      items.push({ id: `inbox:${a.id}`, label: a.name, keywords: `inbox ${a.email}`, color: a.color, run: () => router.push(`${base}/inbox.${a.id}`) })
    }
    for (const l of bootstrap.labels) {
      items.push({ id: `label:${l.id}`, label: l.name, keywords: "label tag", color: l.color, run: () => router.push(`${base}/label.${l.id}`) })
    }
    for (const c of chats) {
      const other = c.isDirect ? member(c.memberIds.find((id) => id !== meId)) : undefined
      items.push({
        id: `chat:${c.id}`,
        label: c.isDirect ? memberName(other, "Direct message") : c.name || "Group chat",
        keywords: "chat message dm",
        icon: c.isDirect ? undefined : Hash,
        avatar: other ? { name: other.name, email: other.email, avatarUrl: other.avatarUrl } : undefined,
        run: () => router.push(`${base}/chats/${c.id}`),
      })
    }
    items.push(
      { id: "page:tasks", label: "Tasks", keywords: "todo", icon: SquareCheckBig, run: () => router.push(`${base}/tasks`) },
      { id: "page:contacts", label: "Contacts", keywords: "people address book", icon: Contact, run: () => router.push(`${base}/contacts`) },
      { id: "page:settings", label: "Settings", keywords: "preferences workspace", icon: Settings, run: () => router.push(`${base}/settings`) }
    )
    return items
  }, [bootstrap.teams, bootstrap.accounts, bootstrap.labels, chats, base, router, can, member, meId])

  const actions = useMemo<StaticItem[]>(() => {
    const list: StaticItem[] = [
      { id: "action:compose", label: "Compose new message", keywords: "write email new", icon: SquarePen, shortcut: "n", run: () => inboxUI.openCompose() },
    ]
    if (can("chats.create")) {
      list.push({ id: "action:chat", label: "New chat", keywords: "message teammate dm group", icon: MessagesSquare, shortcut: "mod+shift+n", run: () => inboxUI.set({ newChatOpen: true }) })
    }
    list.push(
      {
        id: "action:theme",
        label: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        keywords: "theme dark light mode appearance",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      { id: "action:shortcuts", label: "Keyboard shortcuts", keywords: "help keys hotkeys", icon: Keyboard, shortcut: "?", run: () => inboxUI.set({ shortcutsOpen: true }) }
    )
    return list
  }, [can, resolvedTheme, setTheme])

  // Operator hints: all when empty, otherwise those completing the last word.
  const lastWord = query.endsWith(" ") ? "" : (query.split(/\s+/).pop() ?? "")
  const hints = !q
    ? SEARCH_HINTS
    : lastWord && !/^\w+:\S/.test(lastWord)
      ? SEARCH_HINTS.filter((h) => h.token.startsWith(lastWord.toLowerCase()) && h.token !== lastWord.toLowerCase())
      : []
  const insertHint = (token: string) => {
    const prefix = query.endsWith(" ") || !lastWord ? query : query.slice(0, query.length - lastWord.length)
    const needsSpace = prefix && !prefix.endsWith(" ")
    setQuery(`${prefix}${needsSpace ? " " : ""}${token}${token.endsWith(":") ? "" : " "}`)
    inputRef.current?.focus()
  }

  const goToMatches = goTo.filter((i) => matches(i, lower)).slice(0, q ? 12 : goTo.length)
  const actionMatches = actions.filter((i) => matches(i, lower))
  const searching = q.length >= 2 && (search.isFetching || debounced.trim() !== q)

  const renderStatic = (item: StaticItem) => (
    <CommandItem key={item.id} value={item.id} onSelect={() => run(item.run)}>
      <ItemIcon item={item} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.shortcut && <Shortcut combo={item.shortcut} />}
    </CommandItem>
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? undefined : close())}
      title="Search and commands"
      description="Search conversations, jump to a mailbox or run a command"
      className="top-[max(0.5rem,env(safe-area-inset-top))] max-w-[calc(100%-1rem)] sm:top-[12%] sm:max-w-xl"
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search conversations or type a command…"
          aria-label="Search conversations or commands"
          className="text-[14px]"
        />
        <CommandList className="max-h-[min(28rem,70dvh)] px-1 pb-1">
          <CommandEmpty>
            <span className="text-muted-foreground">Nothing found.</span>
          </CommandEmpty>

          {q && (
            <CommandGroup heading={q.length >= 2 ? "Conversations" : undefined}>
              {results.map((item) => (
                <CommandItem key={item.id} value={`conv:${item.id}`} onSelect={() => openConversation(item)} className="py-2">
                  <ResultRow item={item} meId={meId} />
                </CommandItem>
              ))}
              {searching && results.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-muted-foreground" role="status">
                  <LoaderCircle className="size-4 animate-spin" /> Searching…
                </div>
              )}
              {q.length >= 2 && !searching && results.length === 0 && search.isSuccess && (
                <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No conversations match “{q}”.</p>
              )}
              <CommandItem value="search:all" onSelect={searchAll}>
                {searching && results.length > 0 ? <LoaderCircle className="animate-spin text-muted-foreground" /> : <Search className="text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">
                  Search all conversations for <span className="font-medium">“{q}”</span>
                </span>
                <Shortcut combo="Enter" />
              </CommandItem>
            </CommandGroup>
          )}

          {!q && actionMatches.length > 0 && <CommandGroup heading="Actions">{actionMatches.map(renderStatic)}</CommandGroup>}

          {goToMatches.length > 0 && (
            <>
              {(q || actionMatches.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Go to">{goToMatches.map(renderStatic)}</CommandGroup>
            </>
          )}

          {q && actionMatches.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Actions">{actionMatches.map(renderStatic)}</CommandGroup>
            </>
          )}

          {hints.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Search operators">
                {hints.map((h) => (
                  <CommandItem key={h.token} value={`hint:${h.token}`} onSelect={() => insertHint(h.token)}>
                    {h.token.startsWith("label:") ? <Tag className="text-muted-foreground" /> : h.token.startsWith("assignee:") ? <Users className="text-muted-foreground" /> : <TextSearch className="text-muted-foreground" />}
                    <code className="font-mono text-[12px]">{h.token}</code>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{h.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="flex items-center gap-3 border-t px-3 py-2 font-mono text-[10.5px] text-muted-foreground max-sm:hidden">
          <span>
            <kbd className="font-sans">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> open
          </span>
          <span>
            <kbd className="font-sans">esc</kbd> close
          </span>
        </div>
      </Command>
    </CommandDialog>
  )
}
