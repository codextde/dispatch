"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { formatDistanceToNowStrict } from "date-fns"
import {
  BookUser,
  Building2,
  Download,
  Filter,
  Lock,
  Plus,
  Search,
  Tag,
  Upload,
  Users,
  X,
} from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { AreaTopBar } from "@/components/tasks/area-top-bar"
import { ContactDetail } from "./contact-detail"
import { ImportContactsDialog, NewContactDialog } from "./contact-dialogs"
import {
  displayName,
  useContactFacets,
  useContactList,
  type ContactDto,
  type ContactFacets,
  type ContactFilters,
  type ContactScope,
  type ContactSort,
} from "./use-contacts"

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))
}

export function ContactsView() {
  const { org } = useOrg()
  const slug = org.slug
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const [search, setSearch] = useState("")
  const q = useDeferredValue(search.trim())
  const [scope, setScope] = useState<ContactScope>("all")
  const [company, setCompany] = useState<string | undefined>()
  const [tag, setTag] = useState<string | undefined>()
  const [sort, setSort] = useState<ContactSort>("name")
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const filters: ContactFilters = useMemo(() => ({ q: q || undefined, scope, company, tag, sort }), [q, scope, company, tag, sort])
  const list = useContactList(slug, filters)
  const { data: facets } = useContactFacets(slug)
  const contacts = useMemo(() => list.data?.pages.flatMap((p) => p.contacts) ?? [], [list.data])
  const total = list.data?.pages[0]?.total ?? 0

  const selectedId = searchParams.get("c")
  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) params.set("c", id)
      else params.delete("c")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Keyboard: / search, n new contact, j/k move selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || document.querySelector("[role=dialog]")) return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "n") {
        e.preventDefault()
        setNewOpen(true)
      } else if ((e.key === "j" || e.key === "k") && contacts.length) {
        e.preventDefault()
        const idx = contacts.findIndex((c) => c.id === selectedId)
        const next = e.key === "j" ? Math.min(contacts.length - 1, idx + 1) : Math.max(0, idx - 1)
        select(contacts[next]!.id)
        document.getElementById(`contact-${contacts[next]!.id}`)?.scrollIntoView({ block: "nearest" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [contacts, selectedId, select])

  const exportHref = useMemo(() => {
    const p = new URLSearchParams()
    if (q) p.set("q", q)
    if (company) p.set("company", company)
    if (tag) p.set("tag", tag)
    if (scope !== "all") p.set("scope", scope)
    return `/api/w/${slug}/contacts/export${p.size ? `?${p}` : ""}`
  }, [slug, q, company, tag, scope])

  const clearFilters = () => {
    setCompany(undefined)
    setTag(undefined)
    setScope("all")
    setSearch("")
  }
  const hasFilters = Boolean(company || tag || scope !== "all" || q)

  const filterPanel = (
    <FilterPanel
      facets={facets}
      scope={scope}
      company={company}
      tag={tag}
      onScope={(s) => {
        setScope(s)
        setFiltersOpen(false)
      }}
      onCompany={(c) => {
        setCompany(c)
        setFiltersOpen(false)
      }}
      onTag={(t) => {
        setTag(t)
        setFiltersOpen(false)
      }}
    />
  )

  const grouped = sort === "company"
  const rows = useMemo(
    () =>
      contacts.map((c, i) => {
        const group = c.company || "No company"
        const prev = i > 0 ? contacts[i - 1]!.company || "No company" : null
        return { contact: c, header: grouped && group !== prev ? group : null }
      }),
    [contacts, grouped]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AreaTopBar>
        <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)} className="hidden text-muted-foreground sm:inline-flex">
          <Upload /> Import
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex">
          <a href={exportHref} download>
            <Download /> Export
          </a>
        </Button>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus />
          <span className="hidden sm:inline">New contact</span>
        </Button>
      </AreaTopBar>

      <h1 className="sr-only">Contacts</h1>
      <div className="flex min-h-0 flex-1">
        {/* Filters (desktop) */}
        <aside className="scrollbar-thin hidden w-56 shrink-0 overflow-y-auto border-r bg-sidebar/60 lg:block" aria-label="Contact filters">
          {filterPanel}
        </aside>

        {/* List */}
        <div className={cn("flex min-w-0 flex-col border-r md:w-[380px] md:shrink-0 xl:w-[440px]", "flex-1 md:flex-none")}>
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setSearch(""), e.currentTarget.blur())}
                placeholder="Search name, email, company…"
                aria-label="Search contacts"
                className="h-8 w-full rounded-lg border bg-background pr-7 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <Kbd className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 md:inline-flex">/</Kbd>
              )}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as ContactSort)}>
              <SelectTrigger size="sm" className="h-8 w-auto shrink-0 text-[13px]" aria-label="Sort contacts">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="recent">Recent</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon-sm" className="size-8 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Filters">
              <Filter />
            </Button>
          </div>

          {hasFilters && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2 text-xs">
              <span className="text-muted-foreground tabular-nums">{list.isPending ? "…" : total.toLocaleString()} results</span>
              {scope !== "all" && <FilterChip label={scope === "shared" ? "Shared" : "Private"} onClear={() => setScope("all")} />}
              {company !== undefined && <FilterChip icon={<Building2 className="size-3" />} label={company || "No company"} onClear={() => setCompany(undefined)} />}
              {tag && <FilterChip icon={<Tag className="size-3" />} label={tag} onClear={() => setTag(undefined)} />}
              <button type="button" onClick={clearFilters} className="ml-auto text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          )}

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" aria-label="Contacts">
            {list.isPending ? (
              <ListSkeleton />
            ) : list.isError ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyTitle>Couldn’t load contacts</EmptyTitle>
                  <EmptyDescription>Check your connection and try again.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                    Retry
                  </Button>
                </EmptyContent>
              </Empty>
            ) : contacts.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">{hasFilters ? <Search /> : <BookUser />}</EmptyMedia>
                  <EmptyTitle>{hasFilters ? "No matching contacts" : "Your address book is empty"}</EmptyTitle>
                  <EmptyDescription>
                    {hasFilters
                      ? "Try another search or clear the filters."
                      : "Contacts are added automatically as you email people. You can also add or import them."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center">
                  {hasFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setNewOpen(true)}>
                        <Plus /> New contact
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <Upload /> Import CSV
                      </Button>
                    </>
                  )}
                </EmptyContent>
              </Empty>
            ) : (
              <>
                {rows.map(({ contact: c, header }) => (
                  <div key={c.id}>
                    {header && (
                      <div className="sticky top-0 z-[1] flex h-8 items-center gap-2 border-b bg-surface/95 px-4 text-[12px] font-medium backdrop-blur">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{header}</span>
                      </div>
                    )}
                    <ContactRow contact={c} selected={c.id === selectedId} onSelect={() => select(c.id)} showCompany={!grouped} />
                  </div>
                ))}
                <div ref={sentinel} className="flex h-12 items-center justify-center">
                  {isFetchingNextPage && <Spinner className="size-4 text-muted-foreground" />}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Detail (tablet/desktop) */}
        <div className="hidden min-w-0 flex-1 md:flex">
          {selectedId && !isMobile ? (
            <ContactDetail
              key={selectedId}
              slug={slug}
              contactId={selectedId}
              className="flex-1"
              tagSuggestions={facets?.tags.map((t) => t.tag)}
              onDeleted={() => select(null)}
              onMerged={(id) => select(id)}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>{facets ? `${facets.counts.all.toLocaleString()} contacts` : "Contacts"}</EmptyTitle>
                <EmptyDescription>
                  Select someone to see their details, notes and every conversation you’ve had with them.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd> to move · <Kbd>N</Kbd> new contact · <Kbd>/</Kbd> search
                </span>
              </EmptyContent>
            </Empty>
          )}
        </div>
      </div>

      {/* Mobile detail */}
      <Sheet open={Boolean(isMobile && selectedId)} onOpenChange={(o) => !o && select(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Contact</SheetTitle>
            <SheetDescription>Contact details</SheetDescription>
          </SheetHeader>
          {isMobile && selectedId && (
            <ContactDetail
              slug={slug}
              contactId={selectedId}
              className="safe-bottom flex-1 pt-6"
              tagSuggestions={facets?.tags.map((t) => t.tag)}
              onDeleted={() => select(null)}
              onMerged={(id) => select(id)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Mobile filters */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription className="sr-only">Filter contacts</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{filterPanel}</div>
          <div className="safe-bottom flex gap-2 border-t p-3 sm:hidden">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setImportOpen(true)}>
              <Upload /> Import
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={exportHref} download>
                <Download /> Export
              </a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <NewContactDialog slug={slug} open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => select(c.id)} />
      <ImportContactsDialog slug={slug} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

function ContactRow({
  contact,
  selected,
  onSelect,
  showCompany,
}: {
  contact: ContactDto
  selected: boolean
  onSelect: () => void
  showCompany: boolean
}) {
  const secondary = showCompany ? [contact.title, contact.company].filter(Boolean).join(" · ") : contact.title
  return (
    <button
      type="button"
      id={`contact-${contact.id}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60",
        selected && "bg-accent/80 hover:bg-accent/80 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand"
      )}
    >
      <UserAvatar name={contact.name} email={contact.email} src={contact.avatarUrl} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium">{displayName(contact)}</span>
          {contact.isPrivate && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Private" />}
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">{secondary || contact.email}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {contact.lastContactedAt && (
          <time className="text-[11.5px] text-muted-foreground tabular-nums" dateTime={contact.lastContactedAt}>
            {formatDistanceToNowStrict(new Date(contact.lastContactedAt), { addSuffix: false })}
          </time>
        )}
        {contact.tags.length > 0 && (
          <span className="flex max-w-32 gap-1 overflow-hidden">
            {contact.tags.slice(0, 2).map((t) => (
              <span key={t} className="truncate rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
                {t}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}

function FilterChip({ label, icon, onClear }: { label: string; icon?: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 font-medium">
      {icon}
      <span className="max-w-40 truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="text-muted-foreground hover:text-foreground">
        <X className="size-3" />
      </button>
    </span>
  )
}

function FilterPanel({
  facets,
  scope,
  company,
  tag,
  onScope,
  onCompany,
  onTag,
}: {
  facets: ContactFacets | undefined
  scope: ContactScope
  company: string | undefined
  tag: string | undefined
  onScope: (s: ContactScope) => void
  onCompany: (c: string | undefined) => void
  onTag: (t: string | undefined) => void
}) {
  const [showAllCompanies, setShowAllCompanies] = useState(false)
  const companies = facets?.companies ?? []
  const visibleCompanies = showAllCompanies ? companies : companies.slice(0, 12)
  const item = (active: boolean) =>
    cn(
      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
      active && "bg-sidebar-accent font-medium text-sidebar-foreground"
    )
  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <div>
        <div className="px-2 pb-1.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/80 uppercase">Address book</div>
        {(
          [
            { v: "all", label: "All contacts", icon: BookUser, n: facets?.counts.all },
            { v: "shared", label: "Shared", icon: Users, n: facets?.counts.shared },
            { v: "private", label: "Private", icon: Lock, n: facets?.counts.private },
          ] as const
        ).map((s) => (
          <button key={s.v} type="button" className={item(scope === s.v)} onClick={() => onScope(s.v)} aria-pressed={scope === s.v}>
            <s.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{s.label}</span>
            {s.n !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{s.n}</span>}
          </button>
        ))}
      </div>
      {companies.length > 0 && (
        <div>
          <div className="px-2 pb-1.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/80 uppercase">Companies</div>
          {visibleCompanies.map((c) => (
            <button
              key={c.name}
              type="button"
              className={item(company?.toLowerCase() === c.name.toLowerCase())}
              onClick={() => onCompany(company?.toLowerCase() === c.name.toLowerCase() ? undefined : c.name)}
              aria-pressed={company?.toLowerCase() === c.name.toLowerCase()}
            >
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
            </button>
          ))}
          {companies.length > 12 && (
            <button type="button" onClick={() => setShowAllCompanies((s) => !s)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {showAllCompanies ? "Show fewer" : `Show all ${companies.length}`}
            </button>
          )}
        </div>
      )}
      {(facets?.tags.length ?? 0) > 0 && (
        <div>
          <div className="px-2 pb-1.5 font-mono text-[10.5px] font-medium tracking-wider text-muted-foreground/80 uppercase">Tags</div>
          <div className="flex flex-wrap gap-1 px-1">
            {facets!.tags.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => onTag(tag === t.tag ? undefined : t.tag)}
                aria-pressed={tag === t.tag}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
                  tag === t.tag && "border-foreground/30 bg-sidebar-accent font-medium"
                )}
              >
                {t.tag}
                <span className="text-muted-foreground tabular-nums">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading contacts">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 13) % 35)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  )
}
