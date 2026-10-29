"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"
import {
  AtSign,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Clock,
  Contact,
  FilePen,
  Hash,
  Inbox,
  Layers,
  PanelLeftClose,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  ShieldAlert,
  SquareCheckBig,
  SquarePen,
  Star,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { UserMenu, WorkspaceSwitcher } from "@/components/app/user-menu"
import { UserAvatar } from "@/components/app/user-avatar"
import { useOrg } from "@/components/app/org-provider"
import { useChats, useCounts } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { usePersistentState } from "@/hooks/inbox/use-persistent-state"
import { useShortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { memberName } from "@/lib/inbox/format"
import type { LabelSummary } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useInbox } from "./inbox-provider"
import { NotificationsButton } from "./notifications-popover"
import { useShortcutHint } from "./shortcut-hint"
import { useServerAction } from "@/components/settings/use-server-action"
import { updateSidebarPreferences } from "@/server/workspace/actions/personal"

const CUSTOMIZABLE_BOXES = ["assigned", "mentions", "starred", "snoozed", "drafts", "scheduled", "sent"] as const
type CustomizableBox = (typeof CUSTOMIZABLE_BOXES)[number]
const CUSTOMIZABLE_SECTIONS = ["teams", "inboxes", "labels", "chats"] as const
type CustomizableSection = (typeof CUSTOMIZABLE_SECTIONS)[number]

const PRIMARY: { box: string; label: string; icon: LucideIcon; count?: "unread" | "total" }[] = [
  { box: "inbox", label: "Inbox", icon: Inbox, count: "unread" },
  { box: "assigned", label: "Assigned to me", icon: UserCheck, count: "unread" },
  { box: "mentions", label: "Mentions", icon: AtSign, count: "unread" },
  { box: "starred", label: "Starred", icon: Star },
  { box: "snoozed", label: "Snoozed", icon: Clock },
  { box: "drafts", label: "Drafts", icon: FilePen, count: "total" },
  { box: "scheduled", label: "Scheduled", icon: CalendarClock, count: "total" },
  { box: "sent", label: "Sent", icon: Send },
]

const MORE: { box: string; label: string; icon: LucideIcon; count?: "unread" }[] = [
  { box: "unassigned", label: "Unassigned", icon: CircleDashed, count: "unread" },
  { box: "all", label: "All conversations", icon: Layers },
  { box: "closed", label: "Closed", icon: CircleCheck },
  { box: "spam", label: "Spam", icon: ShieldAlert },
  { box: "trash", label: "Trash", icon: Trash2 },
]

function CountBadge({ value, tone = "muted" }: { value?: number; tone?: "muted" | "brand" }) {
  if (!value) return null
  return (
    <span
      className={cn(
        "ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center font-mono text-[10.5px] leading-5 tabular-nums",
        tone === "brand" ? "bg-brand/15 font-semibold text-foreground dark:bg-brand/20" : "text-muted-foreground"
      )}
    >
      {value > 999 ? "999+" : value}
    </span>
  )
}

function NavItem({
  href,
  active,
  icon: Icon,
  label,
  count,
  tone,
  dot,
  trailing,
  onNavigate,
  title,
}: {
  href: string
  active: boolean
  icon?: LucideIcon
  label: string
  count?: number
  tone?: "muted" | "brand"
  dot?: string
  trailing?: React.ReactNode
  onNavigate?: () => void
  title?: string
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10 max-lg:text-sm",
        active && "bg-sidebar-accent font-medium text-sidebar-foreground"
      )}
    >
      {Icon ? (
        <Icon className={cn("size-4 shrink-0 text-muted-foreground group-hover/nav:text-foreground", active && "text-foreground")} />
      ) : dot ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          <span className="size-2 rounded-full" style={{ backgroundColor: dot }} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      <CountBadge value={count} tone={tone} />
    </Link>
  )
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = usePersistentState(`dispatch:sidebar:${id}`, true)
  return (
    <div className="mt-4">
      <div className="group/section flex h-7 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="mt-0.5 flex flex-col gap-px">{children}</div>}
    </div>
  )
}

type LabelNode = LabelSummary & { children: LabelNode[] }

function labelTree(labels: LabelSummary[]): LabelNode[] {
  const visible = labels.filter((l) => l.showInSidebar)
  const nodes = new Map<string, LabelNode>(visible.map((l) => [l.id, { ...l, children: [] }]))
  const roots: LabelNode[] = []
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n)
  }
  return roots
}

export function Sidebar({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const shortcutLabel = useShortcutLabel()
  const { slug, bootstrap, member, meId } = useInbox()
  const { can, org } = useOrg()
  const { t, locale } = useI18n()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const initialSidebarPreferences = bootstrap.me.preferences.sidebar as
    | { hiddenItems?: CustomizableBox[]; hiddenSections?: CustomizableSection[] }
    | undefined
  const [hiddenItems, setHiddenItems] = useState<CustomizableBox[]>(initialSidebarPreferences?.hiddenItems ?? [])
  const [hiddenSections, setHiddenSections] = useState<CustomizableSection[]>(initialSidebarPreferences?.hiddenSections ?? [])
  const { pending: savingSidebar, run: saveSidebar } = useServerAction()
  const hint = useShortcutHint()
  const params = useParams<{ box?: string; conversationId?: string }>()
  const current = params.box ? decodeURIComponent(params.box) : ""
  const conversationId = params.conversationId
  const { data: counts = bootstrap.counts } = useCounts(slug, bootstrap.counts)
  const { data: chats = bootstrap.chats } = useChats(slug, bootstrap.chats)
  const [showMore, setShowMore] = usePersistentState("dispatch:sidebar:more", false)
  const base = `/w/${slug}`
  const tree = useMemo(() => labelTree(bootstrap.labels), [bootstrap.labels])
  const workspaceHiddenItems = org.navigation.hiddenItems
  const workspaceHiddenSections = org.navigation.hiddenSections
  const hiddenPrimary = PRIMARY.filter((item) => CUSTOMIZABLE_BOXES.includes(item.box as CustomizableBox) && hiddenItems.includes(item.box as CustomizableBox) && !workspaceHiddenItems.includes(item.box))
  const moreItems = [...MORE, ...hiddenPrimary]
  const moreActive = moreItems.some((m) => m.box === current)
  const boxLabel: Record<string, Parameters<typeof t>[0]> = { inbox: "inbox", assigned: "assigned", mentions: "mentions", starred: "starred", snoozed: "snoozed", drafts: "drafts", scheduled: "scheduled", sent: "sent", unassigned: "unassigned", all: "allConversations", closed: "closed", spam: "spam", trash: "trash" }

  const saveSidebarPreferences = (items: CustomizableBox[], sections: CustomizableSection[]) =>
    saveSidebar(
      () => updateSidebarPreferences({ slug, hiddenItems: items, hiddenSections: sections }),
      {
        onSuccess: () => {
          setHiddenItems(items)
          setHiddenSections(sections)
        },
      }
    )

  const renderLabel = (l: LabelNode, depth: number): React.ReactNode => (
    <div key={l.id}>
      <div style={{ paddingLeft: depth * 12 }}>
        <NavItem
          href={`${base}/label.${l.id}`}
          active={current === `label.${l.id}`}
          label={l.name}
          dot={l.color}
          count={counts[`label.${l.id}`]}
          onNavigate={onNavigate}
          trailing={l.visibility === "private" ? <UserRound className="size-3 text-muted-foreground" aria-label={t("inboxUiPrivate")} /> : null}
        />
      </div>
      {l.children.map((c) => renderLabel(c, depth + 1))}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
        <WorkspaceSwitcher className="min-w-0 flex-1" />
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label={t("less")}>
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("less")}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={locale === "it" ? "Personalizza barra laterale" : "Customize sidebar"}
              onClick={() => setCustomizeOpen(true)}
            >
              <SlidersHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{locale === "it" ? "Personalizza barra laterale" : "Customize sidebar"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex shrink-0 gap-1.5 px-2 pb-2">
        <Button
          className="h-8 flex-1 justify-start gap-2 max-lg:h-10"
          onClick={() => {
            onNavigate?.()
            inboxUI.openCompose()
          }}
        >
          <SquarePen />
          {t("compose")}
          {hint("compose") && <Kbd className="ml-auto bg-primary-foreground/15 text-primary-foreground/80 max-lg:hidden">{hint("compose")}</Kbd>}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="max-lg:size-10"
              aria-label={t("search")}
              onClick={() => {
                onNavigate?.()
                inboxUI.set({ paletteOpen: true, paletteQuery: "" })
              }}
            >
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t("search")} <Kbd>{shortcutLabel("mod+k")[0]}</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <nav aria-label={t("inboxUiMailboxes")} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
        {PRIMARY.filter((item) => !workspaceHiddenItems.includes(item.box) && (!hiddenItems.includes(item.box as CustomizableBox) || current === item.box)).map((item) => (
            <NavItem
              key={item.box}
              href={`${base}/${item.box}`}
              active={current === item.box}
              icon={item.icon}
              label={t(boxLabel[item.box] ?? "inbox")}
              count={item.count ? counts[item.box] : undefined}
              tone={item.count === "unread" && item.box !== "mentions" ? "brand" : "muted"}
              onNavigate={onNavigate}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore || moreActive}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10"
          >
            <ChevronRight className={cn("size-4 transition-transform", (showMore || moreActive) && "rotate-90")} />
            {showMore || moreActive ? t("less") : t("more")}
          </button>
          {(showMore || moreActive) &&
            moreItems.map((item) => (
              <NavItem
                key={item.box}
                href={`${base}/${item.box}`}
                active={current === item.box}
                icon={item.icon}
                label={t(boxLabel[item.box] ?? "inbox")}
                count={item.count ? counts[item.box] : undefined}
                onNavigate={onNavigate}
              />
            ))}
        </div>

        {bootstrap.teams.length > 0 && !workspaceHiddenSections.includes("teams") && (!hiddenSections.includes("teams") || current.startsWith("team.")) && (
          <Section id="teams" title={t("teams")}>
            {bootstrap.teams
              .filter((t) => t.isMember || can("conversations.view_all"))
              .map((t) => (
                <NavItem
                  key={t.id}
                  href={`${base}/team.${t.id}`}
                  active={current === `team.${t.id}`}
                  label={t.name}
                  dot={t.color}
                  count={counts[`team.${t.id}`]}
                  tone="brand"
                  onNavigate={onNavigate}
                />
              ))}
          </Section>
        )}

        {bootstrap.accounts.length > 0 && !workspaceHiddenSections.includes("inboxes") && (!hiddenSections.includes("inboxes") || current.startsWith("inbox.")) && (
          <Section
            id="inboxes"
            title={t("inboxes")}
            action={
              (can("inboxes.manage") || can("inboxes.connect_personal")) && (
                <Link
                  href={`${base}/settings/inboxes`}
                  onClick={onNavigate}
                  aria-label={locale === "it" ? "Collega una casella" : "Connect an inbox"}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none group-hover/section:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-lg:opacity-100"
                >
                  <Plus className="size-3.5" />
                </Link>
              )
            }
          >
            {bootstrap.accounts.map((a) => (
              <NavItem
                key={a.id}
                href={`${base}/inbox.${a.id}`}
                active={current === `inbox.${a.id}`}
                label={a.name}
                title={`${a.name} · ${a.email}`}
                dot={a.color}
                count={counts[`inbox.${a.id}`]}
                tone="brand"
                onNavigate={onNavigate}
                trailing={
                  a.status === "error" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-label={locale === "it" ? "Errore di sincronizzazione" : "Sync error"} />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">{a.lastError || "This inbox has a connection problem."}</TooltipContent>
                    </Tooltip>
                  ) : a.isPersonal ? (
                    <UserRound className="size-3 shrink-0 text-muted-foreground" aria-label={locale === "it" ? "Casella personale" : "Personal inbox"} />
                  ) : null
                }
              />
            ))}
          </Section>
        )}

        {tree.length > 0 && !workspaceHiddenSections.includes("labels") && (!hiddenSections.includes("labels") || current.startsWith("label.")) && (
          <Section id="labels" title={t("labels")}>
            {tree.map((l) => renderLabel(l, 0))}
          </Section>
        )}

        {org.features.chat && !workspaceHiddenSections.includes("chats") && (!hiddenSections.includes("chats") || current === "chats") && <Section
          id="chats"
          title={t("inboxUiChats")}
          action={
            can("chats.create") && (
              <button
                type="button"
                onClick={() => {
                  onNavigate?.()
                  inboxUI.set({ newChatOpen: true })
                }}
                aria-label={t("inboxUiNewChat")}
                className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none group-hover/section:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-lg:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            )
          }
        >
          {chats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("inboxUiNoChats")}</p>}
          {chats.slice(0, 30).map((chat) => {
            const other = chat.isDirect ? member(chat.memberIds.find((id) => id !== meId)) : undefined
            const name = chat.isDirect ? memberName(other, locale === "it" ? "Messaggio diretto" : "Direct message") : chat.name || (locale === "it" ? "Chat di gruppo" : "Group chat")
            const active = current === "chats" && conversationId === chat.id
            return (
              <Link
                key={chat.id}
                href={`${base}/chats/${chat.id}`}
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring max-lg:h-10 max-lg:text-sm",
                  active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                  chat.unread && "font-semibold text-sidebar-foreground"
                )}
              >
                {chat.isDirect ? (
                  <UserAvatar name={other?.name} email={other?.email} src={other?.avatarUrl} size="xs" className="size-4 text-[8px]" />
                ) : (
                  <Hash className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {chat.unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label={locale === "it" ? "Da leggere" : "Unread"} />}
              </Link>
            )
          })}
        </Section>}
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 border-t border-sidebar-border px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <UserMenu compact className="mr-auto" />
        <NotificationsButton onNavigate={onNavigate} />
        {!workspaceHiddenSections.includes("tasks") && <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/tasks`} onClick={onNavigate} aria-label={t("inboxUiTasks")}>
                <SquareCheckBig />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("inboxUiTasks")}</TooltipContent>
        </Tooltip>}
        {!workspaceHiddenSections.includes("contacts") && <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/contacts`} onClick={onNavigate} aria-label={t("inboxUiContacts")}>
                <Contact />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("inboxUiContacts")}</TooltipContent>
        </Tooltip>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/settings`} onClick={onNavigate} aria-label={t("inboxUiSettings")}>
                <Settings />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("inboxUiSettings")}</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{locale === "it" ? "Personalizza la barra laterale" : "Customize your sidebar"}</DialogTitle>
            <DialogDescription>
              {locale === "it"
                ? "Scegli cosa tenere in vista. Le voci di navigazione nascoste restano sotto Altro; le sezioni si possono riattivare qui. La scelta si sincronizza con il tuo account."
                : "Choose what to keep in view. Hidden items remain available under More, and your choices sync with your account."}
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-1" aria-labelledby="sidebar-items-heading">
            <h3 id="sidebar-items-heading" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Voci principali" : "Main navigation"}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              {locale === "it" ? "La Posta in arrivo resta sempre visibile." : "Inbox always stays visible."}
            </p>
            {PRIMARY.map((item) => {
              const customizable = CUSTOMIZABLE_BOXES.includes(item.box as CustomizableBox)
              const workspaceDisabled = workspaceHiddenItems.includes(item.box)
              const visible = !workspaceDisabled && !hiddenItems.includes(item.box as CustomizableBox)
              const id = `sidebar-item-${item.box}`
              return (
                <div key={item.box} className="flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-muted/50">
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[13px] font-medium">
                    {t(boxLabel[item.box] ?? "inbox")}
                  </label>
                  <Switch
                    id={id}
                    checked={visible}
                    disabled={!customizable || workspaceDisabled || savingSidebar}
                    aria-label={locale === "it" ? `Mostra ${t(boxLabel[item.box] ?? "inbox")}` : `Show ${t(boxLabel[item.box] ?? "inbox")}`}
                    onCheckedChange={(checked) => {
                      if (!customizable) return
                      const next = checked
                        ? hiddenItems.filter((box) => box !== item.box)
                        : [...hiddenItems, item.box as CustomizableBox]
                      void saveSidebarPreferences(next, hiddenSections)
                    }}
                  />
                </div>
              )
            })}
          </section>

          <section className="space-y-1 border-t pt-4" aria-labelledby="sidebar-sections-heading">
            <h3 id="sidebar-sections-heading" className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {locale === "it" ? "Sezioni" : "Sections"}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              {locale === "it" ? "Le sezioni nascoste spariscono dalla barra, ma puoi riattivarle da qui." : "Hidden sections disappear from the sidebar, but you can turn them back on here."}
            </p>
            {CUSTOMIZABLE_SECTIONS.filter((section) => section !== "chats" || org.features.chat).map((section) => {
              const labels: Record<CustomizableSection, string> = {
                teams: t("teams"),
                inboxes: t("inboxes"),
                labels: t("labels"),
                chats: t("inboxUiChats"),
              }
              const workspaceDisabled = workspaceHiddenSections.includes(section)
              const visible = !workspaceDisabled && !hiddenSections.includes(section)
              const id = `sidebar-section-${section}`
              return (
                <div key={section} className="flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-muted/50">
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[13px] font-medium">
                    {labels[section]}
                  </label>
                  <Switch
                    id={id}
                    checked={visible}
                    disabled={workspaceDisabled || savingSidebar}
                    aria-label={locale === "it" ? `Mostra sezione ${labels[section]}` : `Show ${labels[section]} section`}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? hiddenSections.filter((entry) => entry !== section)
                        : [...hiddenSections, section]
                      void saveSidebarPreferences(hiddenItems, next)
                    }}
                  />
                </div>
              )
            })}
          </section>

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {savingSidebar
                ? (locale === "it" ? "Salvataggio…" : "Saving…")
                : (locale === "it" ? "Le modifiche vengono salvate automaticamente." : "Changes are saved automatically.")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingSidebar || (hiddenItems.length === 0 && hiddenSections.length === 0)}
              onClick={() => void saveSidebarPreferences([], [])}
            >
              {locale === "it" ? "Ripristina" : "Reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
