"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo } from "react"
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
import { useInbox } from "./inbox-provider"
import { NotificationsButton } from "./notifications-popover"
import { useShortcutHint } from "./shortcut-hint"

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
  const { can } = useOrg()
  const hint = useShortcutHint()
  const params = useParams<{ box?: string; conversationId?: string }>()
  const current = params.box ? decodeURIComponent(params.box) : ""
  const conversationId = params.conversationId
  const { data: counts = bootstrap.counts } = useCounts(slug, bootstrap.counts)
  const { data: chats = bootstrap.chats } = useChats(slug, bootstrap.chats)
  const [showMore, setShowMore] = usePersistentState("dispatch:sidebar:more", false)
  const base = `/w/${slug}`
  const tree = useMemo(() => labelTree(bootstrap.labels), [bootstrap.labels])
  const moreActive = MORE.some((m) => m.box === current)

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
          trailing={l.visibility === "private" ? <UserRound className="size-3 text-muted-foreground" aria-label="Private label" /> : null}
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
              <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="Collapse sidebar">
                <PanelLeftClose />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        )}
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
          Compose
          {hint("compose") && <Kbd className="ml-auto bg-primary-foreground/15 text-primary-foreground/80 max-lg:hidden">{hint("compose")}</Kbd>}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="max-lg:size-10"
              aria-label="Search"
              onClick={() => {
                onNavigate?.()
                inboxUI.set({ paletteOpen: true, paletteQuery: "" })
              }}
            >
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Search <Kbd>{shortcutLabel("mod+k")[0]}</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <nav aria-label="Mailboxes" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
          {PRIMARY.map((item) => (
            <NavItem
              key={item.box}
              href={`${base}/${item.box}`}
              active={current === item.box}
              icon={item.icon}
              label={item.label}
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
            {showMore || moreActive ? "Less" : "More"}
          </button>
          {(showMore || moreActive) &&
            MORE.map((item) => (
              <NavItem
                key={item.box}
                href={`${base}/${item.box}`}
                active={current === item.box}
                icon={item.icon}
                label={item.label}
                count={item.count ? counts[item.box] : undefined}
                onNavigate={onNavigate}
              />
            ))}
        </div>

        {bootstrap.teams.length > 0 && (
          <Section id="teams" title="Teams">
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

        {bootstrap.accounts.length > 0 && (
          <Section
            id="inboxes"
            title="Inboxes"
            action={
              (can("inboxes.manage") || can("inboxes.connect_personal")) && (
                <Link
                  href={`${base}/settings/inboxes`}
                  onClick={onNavigate}
                  aria-label="Connect an inbox"
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
                        <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-label="Sync error" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">{a.lastError || "This inbox has a connection problem."}</TooltipContent>
                    </Tooltip>
                  ) : a.isPersonal ? (
                    <UserRound className="size-3 shrink-0 text-muted-foreground" aria-label="Personal inbox" />
                  ) : null
                }
              />
            ))}
          </Section>
        )}

        {tree.length > 0 && (
          <Section id="labels" title="Labels">
            {tree.map((l) => renderLabel(l, 0))}
          </Section>
        )}

        <Section
          id="chats"
          title="Chats"
          action={
            can("chats.create") && (
              <button
                type="button"
                onClick={() => {
                  onNavigate?.()
                  inboxUI.set({ newChatOpen: true })
                }}
                aria-label="New chat"
                className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none group-hover/section:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-lg:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            )
          }
        >
          {chats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet.</p>}
          {chats.slice(0, 30).map((chat) => {
            const other = chat.isDirect ? member(chat.memberIds.find((id) => id !== meId)) : undefined
            const name = chat.isDirect ? memberName(other, "Direct message") : chat.name || "Group chat"
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
                {chat.unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              </Link>
            )
          })}
        </Section>
      </nav>

      <div className="flex shrink-0 items-center gap-0.5 border-t border-sidebar-border px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <UserMenu compact className="mr-auto" />
        <NotificationsButton onNavigate={onNavigate} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/tasks`} onClick={onNavigate} aria-label="Tasks">
                <SquareCheckBig />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tasks</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/contacts`} onClick={onNavigate} aria-label="Contacts">
                <Contact />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Contacts</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="max-lg:size-10">
              <Link href={`${base}/settings`} onClick={onNavigate} aria-label="Settings">
                <Settings />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
