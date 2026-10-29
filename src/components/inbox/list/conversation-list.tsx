"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowDownUp, Check, ListFilter, Plus, RefreshCw, Search, SearchX, SquarePen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrg } from "@/components/app/org-provider"
import { defaultStatus, parseBox, supportsStatusFilter, type ListFilters, type StatusFilter } from "@/lib/inbox/boxes"
import { keysFor } from "@/lib/inbox/shortcuts"
import type { ConversationListItem } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { inboxKeys, useConversationList } from "@/hooks/inbox/queries"
import { inboxUI, useInboxUI } from "@/hooks/inbox/store"
import { useConversationActions } from "@/hooks/inbox/use-conversation-actions"
import { useHotkeys } from "@/hooks/inbox/use-hotkeys"
import { usePersistentState } from "@/hooks/inbox/use-persistent-state"
import { timePresets } from "@/lib/inbox/snooze"
import { useInbox } from "../inbox-provider"
import { useBoxInfo } from "../box-info"
import { MobileNavButton } from "../mail-shell"
import { BulkBar } from "./bulk-bar"
import { ConversationRow } from "./conversation-row"
import { useI18n } from "@/lib/i18n"

const EMPTY_FILTERS: ListFilters = {}

function RowSkeleton() {
  return (
    <div className="flex gap-3 border-b border-border/60 py-3 pr-3 pl-4">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between gap-4">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  )
}

export function ConversationList({ box }: { box: string }) {
  const { slug, shortcutsEnabled, shortcutScheme } = useInbox()
  const { locale, t } = useI18n()
  const { can } = useOrg()
  const router = useRouter()
  const qc = useQueryClient()
  const params = useParams<{ conversationId?: string }>()
  const searchParams = useSearchParams()
  const openId = params.conversationId ?? null
  const parsed = parseBox(box)!
  const info = useBoxInfo(box)
  const isSearch = box === "search"
  const isChats = box === "chats"
  const q = isSearch ? (searchParams.get("q") ?? "") : ""
  const [searchInput, setSearchInput] = useState(q)
  useEffect(() => setSearchInput(q), [q])
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = searchInput.trim()
    router.push(`/w/${slug}/search${next ? `?q=${encodeURIComponent(next)}` : ""}`)
  }
  const viewDescription = (() => {
    if (box === "inbox") return locale === "it"
      ? "Email aperte e non posticipate delle tue caselle personali, assegnate a te o seguite da te se non lette. Le email condivise non assegnate sono in Non assegnate."
      : "Open, unsnoozed mail from your personal inboxes, assigned to you, or followed by you while unread. Unassigned shared mail is under Unassigned."
    if (box === "unassigned") return locale === "it"
      ? "Email aperte e non posticipate accessibili al team che non sono ancora assegnate a nessuno."
      : "Open, unsnoozed email you can access that has not been assigned to anyone."
    if (box === "all") return locale === "it"
      ? "Tutte le email accessibili, comprese quelle chiuse o posticipate. Spam e cestino sono nelle rispettive viste."
      : "All email you can access, including closed and snoozed conversations. Spam and trash have their own views."
    if (box === "spam") return locale === "it"
      ? "Email contrassegnate come spam. Puoi ripristinare quelle finite qui per errore."
      : "Email marked as spam. You can restore messages that ended up here by mistake."
    if (box === "trash") return locale === "it"
      ? "Email spostate nel cestino. Puoi ripristinarle o eliminarle definitivamente."
      : "Email moved to trash. You can restore them or delete them permanently."
    return info.description
  })()

  const [stored, setStored] = usePersistentState<ListFilters>(`dispatch:filters:${box}`, EMPTY_FILTERS)
  const filters = useMemo<ListFilters>(
    () => ({
      status: supportsStatusFilter(parsed) ? (stored.status ?? defaultStatus(parsed)) : undefined,
      unread: stored.unread || undefined,
      assignee: stored.assignee && stored.assignee !== "anyone" ? stored.assignee : undefined,
      sort: stored.sort === "oldest" ? "oldest" : undefined,
      q: q || undefined,
    }),
    [stored, parsed, q]
  )
  const filtered = !!(filters.unread || filters.assignee || (filters.status && filters.status !== defaultStatus(parsed)))

  const list = useConversationList(slug, box, filters, !isSearch || q.trim().length > 0)
  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: ConversationListItem[] = []
    for (const page of list.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
      }
    }
    return out
  }, [list.data])
  const ids = useMemo(() => items.map((i) => i.id), [items])

  const selected = useInboxUI((s) => s.selected)
  const cursorId = useInboxUI((s) => s.cursorId)
  const selectionMode = selected.size > 0

  // Share the visible order with the conversation view (j/k, auto-advance).
  useEffect(() => {
    inboxUI.set({ listIds: ids })
  }, [ids])
  useEffect(() => {
    inboxUI.set({ listBox: box, listFilters: filters })
  }, [box, filters])
  // Selection is per box.
  useEffect(() => {
    inboxUI.set({ selected: new Set(), anchorId: null, cursorId: null })
  }, [box])

  const hrefFor = useCallback((id: string) => `/w/${slug}/${box}/${id}${isSearch ? `?q=${encodeURIComponent(q)}` : ""}`, [slug, box, isSearch, q])

  const toggleSelect = useCallback(
    (item: ConversationListItem, shift: boolean) => {
      const s = inboxUI.get()
      const next = new Set(s.selected)
      if (shift && s.anchorId && ids.includes(s.anchorId)) {
        const a = ids.indexOf(s.anchorId)
        const b = ids.indexOf(item.id)
        for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(id)
      } else if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      inboxUI.set({ selected: next, anchorId: item.id, cursorId: item.id })
    },
    [ids]
  )

  const onRowClick = useCallback(
    (e: React.MouseEvent, item: ConversationListItem) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || inboxUI.get().selected.size > 0) {
        e.preventDefault()
        toggleSelect(item, e.shiftKey)
        return
      }
      inboxUI.set({ cursorId: item.id })
    },
    [toggleSelect]
  )

  const { run } = useConversationActions()
  const onSwipe = useCallback(
    (item: ConversationListItem, dir: "right" | "left") => {
      if (item.kind === "chat") return
      if (dir === "right") {
        const reopen = item.status === "closed"
        run([item.id], { status: reopen ? "open" : "closed" }, { undo: reopen ? t("inboxUiConversationReopened") : t("inboxUiConversationClosed") })
      } else {
        const tomorrow = timePresets().find((p) => p.id === "tomorrow")!
        run([item.id], { snoozedUntil: tomorrow.date.toISOString() }, { undo: `${t("inboxUiSnoozedUntil")} ${tomorrow.hint}` })
      }
    },
    [run]
  )

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: "400px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Keep the keyboard cursor visible
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = cursorId ?? openId
    if (!target) return
    const el = scroller.current?.querySelector(`[data-id="${target}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [cursorId, openId])

  const move = (delta: 1 | -1) => {
    if (!ids.length) return
    const current = openId ?? cursorId
    const idx = current ? ids.indexOf(current) : -1
    const nextIdx = idx < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, idx + delta))
    const nextId = ids[nextIdx]!
    if (openId) router.push(hrefFor(nextId))
    else inboxUI.set({ cursorId: nextId })
  }
  useHotkeys(
    [
      { keys: keysFor(shortcutScheme, "next"), handler: () => move(1) },
      { keys: keysFor(shortcutScheme, "prev"), handler: () => move(-1) },
      {
        keys: keysFor(shortcutScheme, "open"),
        when: () => !openId && !!inboxUI.get().cursorId,
        handler: () => router.push(hrefFor(inboxUI.get().cursorId!)),
      },
      {
        keys: keysFor(shortcutScheme, "select"),
        handler: () => {
          const id = openId ?? inboxUI.get().cursorId ?? ids[0]
          const item = items.find((i) => i.id === id)
          if (item) toggleSelect(item, false)
        },
      },
      { keys: keysFor(shortcutScheme, "selectAll"), when: () => !openId, handler: () => inboxUI.set({ selected: new Set(ids) }) },
      { keys: ["Escape"], when: () => inboxUI.get().selected.size > 0, handler: () => inboxUI.clearSelection() },
    ],
    shortcutsEnabled
  )

  const setFilter = (patch: Partial<ListFilters>) => setStored((prev) => ({ ...prev, ...patch }))
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id))
  const selectedItems = items.filter((i) => selected.has(i.id))

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 shrink-0 items-center gap-1 border-b px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] md:px-3">
        {selectionMode ? (
          <BulkBar box={box} items={selectedItems} allSelected={allSelected} onSelectAll={() => inboxUI.set({ selected: new Set(ids) })} />
        ) : (
          <>
            <MobileNavButton />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!isSearch && (info.color ? (
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
              ) : (
                <info.icon className="size-4 shrink-0 text-muted-foreground max-lg:hidden" aria-hidden />
              ))}
              <div className="min-w-0 flex-1">
                {isSearch ? (
                  <form onSubmit={submitSearch} role="search" className="flex min-w-0 items-center gap-2">
                    <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={locale === "it" ? "Cerca mittente, oggetto o contenuto…" : "Search sender, subject, or message…"}
                      aria-label={locale === "it" ? "Cerca tutte le email" : "Search all email"}
                      className="h-9 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 md:text-sm"
                    />
                    <Button type="submit" size="sm" className="shrink-0">{locale === "it" ? "Cerca" : "Search"}</Button>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-[15px] font-semibold tracking-tight">{info.title}</h1>
                    {filters.status && filters.status !== "open" && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground uppercase">{filters.status}</span>
                    )}
                  </div>
                )}
                {!isSearch && viewDescription && <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{viewDescription}</p>}
              </div>
            </div>
            {items.length > 0 && !isChats && (
              <Checkbox
                aria-label={t("inboxUiSelectAll")}
                className="mr-1 max-md:hidden"
                checked={false}
                onCheckedChange={() => inboxUI.set({ selected: new Set(ids) })}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-10 md:hidden"
              aria-label={t("inboxUiSearch")}
              onClick={() => inboxUI.set({ paletteOpen: true, paletteQuery: "" })}
            >
              <Search />
            </Button>
            {isChats && can("chats.create") && (
              <Button variant="ghost" size="icon-sm" className="max-md:hidden" aria-label={t("inboxUiNewChat")} onClick={() => inboxUI.set({ newChatOpen: true })}>
                <Plus />
              </Button>
            )}
            {!isChats && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className={cn("relative max-md:size-10", filtered && "text-foreground")} aria-label={t("inboxUiFilterSort")}>
                    <ListFilter />
                    {filtered && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {supportsStatusFilter(parsed) && (
                    <>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{locale === "it" ? "Stato" : "Status"}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={filters.status ?? "open"} onValueChange={(v) => setFilter({ status: v as StatusFilter })}>
                        <DropdownMenuRadioItem value="open">{locale === "it" ? "Aperte" : "Open"}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="closed">{locale === "it" ? "Chiuse" : "Closed"}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="all">{t("inboxUiAll")}</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t("inboxUiAssignee")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={filters.assignee ?? "anyone"} onValueChange={(v) => setFilter({ assignee: v as ListFilters["assignee"] })}>
                    <DropdownMenuRadioItem value="anyone">{t("inboxUiAnyone")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="me">{t("inboxUiAssignedMe")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="others">{t("inboxUiAssignedOthers")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none">{t("inboxUiUnassigned")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => (e.preventDefault(), setFilter({ unread: !stored.unread }))}>
                    <Check className={cn(!stored.unread && "opacity-0")} /> {locale === "it" ? "Solo da leggere" : "Unread only"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFilter({ sort: stored.sort === "oldest" ? "newest" : "oldest" })}>
                    <ArrowDownUp /> {stored.sort === "oldest" ? (locale === "it" ? "Prima le più recenti" : "Newest first") : (locale === "it" ? "Prima le più vecchie" : "Oldest first")}
                  </DropdownMenuItem>
                  {filtered && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setStored(EMPTY_FILTERS)}>{locale === "it" ? "Reimposta filtri" : "Reset filters"}</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-md:hidden"
              aria-label={locale === "it" ? "Aggiorna" : "Refresh"}
              onClick={() => void qc.invalidateQueries({ queryKey: inboxKeys.list(slug, box, filters) })}
            >
              <RefreshCw className={cn(list.isRefetching && !list.isFetchingNextPage && "animate-spin")} />
            </Button>
          </>
        )}
      </header>

      <div ref={scroller} role="listbox" aria-label={info.title} aria-multiselectable className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {list.isPending && list.fetchStatus !== "idle" && Array.from({ length: 8 }, (_, i) => <RowSkeleton key={i} />)}

        {list.isError && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm font-medium">{list.error.message || (locale === "it" ? "Impossibile caricare le conversazioni" : "Could not load conversations")}</p>
            <Button variant="outline" size="sm" onClick={() => list.refetch()}>
              {locale === "it" ? "Riprova" : "Try again"}
            </Button>
          </div>
        )}

        {isSearch && !q.trim() && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">{locale === "it" ? "Cerca per mittente, destinatario, oggetto o testo del messaggio. Puoi anche usare filtri come from: o has:attachment." : "Search by sender, recipient, subject, or message text. You can also use filters like from: or has:attachment."}</p>
          </div>
        )}

        {list.isSuccess && items.length === 0 && (!isSearch || q.trim()) && (
          <div className="flex flex-col items-center px-8 py-16 text-center md:py-24">
            <span className="relative mb-4 flex size-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
              {filtered ? <SearchX className="size-6 text-muted-foreground" /> : <info.icon className="size-6 text-muted-foreground" />}
              {box === "inbox" && !filtered && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-brand ring-4 ring-card" />}
            </span>
            <p className="text-[15px] font-semibold tracking-tight">{filtered ? (locale === "it" ? "Nessuna conversazione corrisponde ai filtri" : "No conversations match your filters") : info.empty.title}</p>
            <p className="mt-1 max-w-72 text-[13px] text-muted-foreground">{filtered ? (locale === "it" ? "Prova un altro stato o assegnatario." : "Try a different status or assignee.") : info.empty.description}</p>
            <div className="mt-4 flex gap-2">
              {filtered && (
                <Button variant="outline" size="sm" onClick={() => setStored(EMPTY_FILTERS)}>
                  {locale === "it" ? "Reimposta filtri" : "Reset filters"}
                </Button>
              )}
              {!filtered && box === "all" && can("inboxes.manage") && (
                <Button size="sm" onClick={() => router.push(`/w/${slug}/settings/inboxes`)}>
                  <Plus /> {locale === "it" ? "Collega una casella" : "Connect an inbox"}
                </Button>
              )}
              {!filtered && isChats && can("chats.create") && (
                <Button size="sm" onClick={() => inboxUI.set({ newChatOpen: true })}>
                  <Plus /> {locale === "it" ? "Avvia una chat" : "Start a chat"}
                </Button>
              )}
              {!filtered && (box === "sent" || box === "drafts") && (
                <Button size="sm" variant="outline" onClick={() => inboxUI.openCompose()}>
                  <SquarePen /> {locale === "it" ? "Scrivi" : "Compose"}
                </Button>
              )}
            </div>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} data-id={item.id}>
            <ConversationRow
              item={item}
              href={hrefFor(item.id)}
              active={item.id === openId}
              cursor={item.id === cursorId && !openId}
              selected={selected.has(item.id)}
              selectionMode={selectionMode}
              onClick={onRowClick}
              onToggleSelect={toggleSelect}
              onSwipe={isChats ? undefined : onSwipe}
            />
          </div>
        ))}

        <div ref={sentinel} />
        {isFetchingNextPage && <RowSkeleton />}
        {!hasNextPage && items.length > 20 && (
          <p className="py-6 text-center font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{locale === "it" ? "Fine dell’elenco" : "End of list"}</p>
        )}
        <div className="h-[calc(env(safe-area-inset-bottom)+5rem)] md:h-[env(safe-area-inset-bottom)]" />
      </div>
      {!selectionMode && (
        <Button
          size="icon-lg"
          className="absolute right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] size-14 rounded-2xl shadow-lg md:hidden"
          aria-label={isChats ? t("inboxUiNewChat") : (locale === "it" ? "Scrivi" : "Compose")}
          onClick={() => (isChats ? inboxUI.set({ newChatOpen: true }) : inboxUI.openCompose())}
        >
          {isChats ? <Plus className="size-6" /> : <SquarePen className="size-6" />}
        </Button>
      )}
    </div>
  )
}
