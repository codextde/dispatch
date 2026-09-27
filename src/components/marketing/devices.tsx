import {
  AtSign,
  Bell,
  Bookmark,
  Copy,
  EllipsisVertical,
  FileText,
  History,
  Inbox,
  Lock,
  MonitorDown,
  PenLine,
  Plus,
  Search,
  Settings,
  Share,
  SquarePlus,
  Star,
  UserRound,
} from "lucide-react"
import { LogoMark } from "@/components/brand/logo"
import { cn } from "@/lib/utils"
import { Avatar, Contact, Key, Label, Line, Mention, Panel, labelColors } from "./visuals/ui"

/*
 * Device frames and static screens for /download. Everything here is
 * decorative; callers wrap it in an element with role="img" and a label.
 */

/** Desktop browser window chrome. */
export function BrowserWindow({
  url,
  installHint,
  className,
  children,
}: {
  url: string
  /** Highlight the address bar's install button */
  installHint?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-28px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[10.5px] text-muted-foreground">
          <Lock className="size-2.5 shrink-0" />
          <span className="truncate">{url}</span>
          <span
            className={cn(
              "ml-auto flex size-4 shrink-0 items-center justify-center rounded-[4px]",
              installHint && "bg-brand-soft text-(--brand-ink) ring-2 ring-brand/50"
            )}
          >
            <MonitorDown className="size-3" />
          </span>
          <Star className="size-3 shrink-0" />
        </span>
      </div>
      {children}
    </div>
  )
}

/** Phone chrome, matching the MobileVisual mock. */
export function PhoneFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "w-[196px] shrink-0 rounded-[30px] border-[5px] border-[#141414] bg-[#141414] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      <div className="relative flex h-[396px] flex-col overflow-hidden rounded-[25px] bg-background text-[10px]">
        <div className="flex shrink-0 items-center justify-between px-4 pt-2.5 pb-1 font-mono text-[8.5px] font-semibold">
          <span>9:41</span>
          <span className="h-3.5 w-12 rounded-full bg-[#141414]" />
          <span>5G</span>
        </div>
        {children}
      </div>
    </div>
  )
}

const listRows = [
  {
    i: "HL",
    n: "Hannah Lee",
    s: "Invoice #4821 was charged twice",
    t: "9:41",
    who: "maya" as const,
    l: ["Billing", labelColors.billing] as const,
    unread: true,
  },
  { i: "OK", n: "Omar Khan", s: "Refund for order #1042", t: "9:12", who: "jonas" as const, l: ["Urgent", labelColors.urgent] as const, unread: true },
  { i: "RB", n: "Rosa Brandt", s: "Adding two seats to our plan", t: "8:55", who: "priya" as const },
  { i: "TS", n: "Tom Silva", s: "Quote for 40 units", t: "Mon", who: "leo" as const, l: ["Lead", labelColors.lead] as const },
  { i: "EW", n: "Emma Wolf", s: "Can we change the delivery date?", t: "Mon", who: "sam" as const },
]

/** A static three-pane inbox for desktop frames. Collapses to the list on small screens. */
export function DesktopInbox({ className }: { className?: string }) {
  const nav = [
    { icon: Inbox, l: "Inbox", c: 12, active: true },
    { icon: UserRound, l: "Assigned to me", c: 3 },
    { icon: AtSign, l: "Mentions", c: 1 },
    { icon: FileText, l: "Drafts" },
  ]
  const teams = [
    { l: "Support", c: 9, color: labelColors.billing },
    { l: "Sales", c: 4, color: labelColors.lead },
    { l: "Billing", c: 2, color: labelColors.vip },
  ]
  return (
    <div
      className={cn(
        "grid h-[340px] grid-cols-1 bg-background text-[11px] text-foreground sm:grid-cols-[150px_1fr] md:grid-cols-[150px_230px_1fr]",
        className
      )}
    >
      <aside className="hidden flex-col gap-0.5 border-r border-border bg-surface/60 p-2 sm:flex">
        <div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-2.5">
          <LogoMark className="size-4" title="" />
          <span className="font-semibold tracking-tight">Acme</span>
        </div>
        {nav.map((n) => (
          <span
            key={n.l}
            className={cn(
              "flex items-center gap-1.5 rounded-[5px] px-1.5 py-1",
              n.active ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
            )}
          >
            <n.icon className="size-3" />
            <span className="flex-1 truncate">{n.l}</span>
            {n.c && <span className="font-mono text-[9px]">{n.c}</span>}
          </span>
        ))}
        <span className="px-1.5 pt-3 pb-1 font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">Team inboxes</span>
        {teams.map((t) => (
          <span key={t.l} className="flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-muted-foreground">
            <span className="size-1.5 rounded-full" style={{ background: t.color }} />
            <span className="flex-1">{t.l}</span>
            <span className="font-mono text-[9px]">{t.c}</span>
          </span>
        ))}
      </aside>
      <div className="flex min-w-0 flex-col border-border md:border-r">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="font-semibold">Inbox</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-[4px] border border-border bg-card px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
            <Search className="size-2.5" /> Search <Key className="h-3.5 min-w-3.5 text-[8px]">⌘K</Key>
          </span>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-hidden">
          {listRows.map((r, idx) => (
            <li key={r.n} className={cn("flex items-start gap-2 px-3 py-2", idx === 0 && "bg-brand-soft/60")}>
              <Contact initials={r.i} size={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={cn("truncate", r.unread ? "font-semibold" : "font-medium")}>{r.n}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{r.t}</span>
                </div>
                <div className="truncate text-[10px] text-muted-foreground">{r.s}</div>
                <div className="mt-1 flex items-center gap-1">
                  {r.l && <Label name={r.l[0]} color={r.l[1]} />}
                  <Avatar who={r.who} size={13} className="ml-auto" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden min-w-0 flex-col md:flex">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="truncate font-semibold">Invoice #4821 was charged twice</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Key>E</Key>
            <Key>I</Key>
            <Key>H</Key>
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden p-3">
          <Panel className="p-2.5">
            <div className="flex items-center gap-1.5">
              <Contact initials="HL" size={16} />
              <span className="font-semibold">Hannah Lee</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">9:41</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <Line w="92%" />
              <Line w="84%" />
              <Line w="58%" />
            </div>
          </Panel>
          <div className="rounded-[7px] border border-dashed border-[#f59e0b]/45 bg-[#f59e0b]/[0.07] p-2.5">
            <div className="flex items-center gap-1.5">
              <Avatar who="jonas" size={16} />
              <span className="font-semibold">Jonas</span>
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-[#b45309]">Internal</span>
            </div>
            <p className="mt-1.5 leading-relaxed">
              <Mention>@Maya</Mention> can you refund the duplicate charge?
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 py-2 text-muted-foreground">
            <PenLine className="size-3" />
            <span className="flex-1">Reply to Hannah…</span>
            <Key>R</Key>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The inbox list at phone size. */
export function PhoneInbox() {
  return (
    <>
      <div className="flex items-center justify-between px-3 pt-1 pb-2">
        <span className="text-[13px] font-semibold tracking-tight">Inbox</span>
        <Avatar who="maya" size={18} />
      </div>
      <ul className="flex-1 divide-y divide-border border-t border-border">
        {listRows.map((r) => (
          <li key={r.n} className="flex items-center gap-2 px-3 py-2">
            <Contact initials={r.i} size={22} />
            <div className="min-w-0 flex-1">
              <div className={cn("truncate", r.unread ? "font-semibold" : "font-medium")}>{r.n}</div>
              <div className="truncate text-[9px] text-muted-foreground">{r.s}</div>
            </div>
            <Avatar who={r.who} size={13} />
          </li>
        ))}
      </ul>
      <div className="flex justify-around border-t border-border px-2 pt-2 pb-3 text-muted-foreground">
        <Inbox className="size-3.5 text-foreground" />
        <UserRound className="size-3.5" />
        <AtSign className="size-3.5" />
        <Settings className="size-3.5" />
      </div>
    </>
  )
}

/** Safari's share sheet with "Add to Home Screen" highlighted. */
export function IosShareSheet() {
  const actions = [
    { icon: Copy, l: "Copy" },
    { icon: Bookmark, l: "Add Bookmark" },
    { icon: SquarePlus, l: "Add to Home Screen", on: true },
    { icon: Search, l: "Find on Page" },
  ]
  return (
    <>
      <div className="flex-1 space-y-2 px-3 pt-2 opacity-40">
        <Line w="60%" />
        <Line w="90%" />
        <Line w="75%" />
        <Line w="85%" />
      </div>
      <div className="absolute inset-x-0 bottom-0 rounded-t-[16px] border-t border-border bg-card px-2.5 pt-2 pb-3 shadow-[0_-12px_24px_-16px_rgba(0,0,0,0.3)]">
        <span className="mx-auto mb-2 block h-1 w-8 rounded-full bg-foreground/15" />
        <div className="mb-2 flex items-center gap-2 px-1">
          <LogoMark className="size-6" title="" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Dispatch</div>
            <div className="truncate text-[8.5px] text-muted-foreground">mail.acme.example</div>
          </div>
          <Share className="size-3 shrink-0 text-[#0a84ff]" />
        </div>
        <ul className="overflow-hidden rounded-[9px] border border-border bg-surface/60">
          {actions.map((a) => (
            <li
              key={a.l}
              className={cn(
                "flex items-center justify-between border-b border-border px-2.5 py-1.5 last:border-b-0",
                a.on && "bg-brand-soft font-semibold text-(--brand-ink)"
              )}
            >
              {a.l}
              <a.icon className="size-3" />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** Chrome for Android's menu with "Add to Home screen" highlighted. */
export function AndroidMenu() {
  const items = [
    { icon: Plus, l: "New tab" },
    { icon: History, l: "History" },
    { icon: Star, l: "Bookmarks" },
    { icon: SquarePlus, l: "Add to Home screen", on: true },
    { icon: Settings, l: "Settings" },
  ]
  return (
    <>
      <div className="flex items-center gap-1.5 px-2.5 pb-2">
        <span className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded-full bg-surface px-2 text-[9px] text-muted-foreground">
          <Lock className="size-2.5 shrink-0" />
          <span className="truncate">mail.acme.example</span>
        </span>
        <EllipsisVertical className="size-3.5 text-foreground" />
      </div>
      <div className="flex-1 space-y-2 px-3 pt-2 opacity-40">
        <Line w="55%" />
        <Line w="90%" />
        <Line w="80%" />
        <Line w="70%" />
        <Line w="85%" />
      </div>
      <Panel className="absolute top-[52px] right-2 w-[132px] overflow-hidden py-1">
        {items.map((it) => (
          <div
            key={it.l}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5",
              it.on ? "bg-brand-soft font-semibold text-(--brand-ink)" : "text-foreground/80"
            )}
          >
            <it.icon className="size-3 shrink-0" />
            <span className="truncate">{it.l}</span>
          </div>
        ))}
      </Panel>
    </>
  )
}

/** A home screen with the installed Dispatch icon. */
export function HomeScreen() {
  const apps = ["#60a5fa", "#f472b6", "#fbbf24", "#34d399", "#a78bfa", "#fb923c", "#94a3b8", "#22d3ee"]
  return (
    <div className="flex flex-1 flex-col bg-[linear-gradient(160deg,#1f2a24,#0f1512)] px-3.5 pt-4 text-white">
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5">
        {apps.map((c, i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span className="size-9 rounded-[10px] opacity-80" style={{ background: c }} />
            <span className="h-1 w-6 rounded-full bg-white/25" />
          </span>
        ))}
        <span className="flex flex-col items-center gap-1">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#faf9f5] ring-2 ring-[#4ade80]/70">
            <svg viewBox="0 0 64 64" className="size-6" aria-hidden>
              <rect width="64" height="64" rx="15" fill="#141414" />
              <path d="M22 18h11.5C41.5 18 47 24.5 47 32s-5.5 14-13.5 14H22" fill="none" stroke="#faf9f5" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 32h19" stroke="#4ade80" strokeWidth="5.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[8px] font-medium">Dispatch</span>
        </span>
      </div>
      <div className="mt-auto mb-3 grid grid-cols-4 gap-2.5 rounded-[16px] bg-white/10 p-2">
        {["#4ade80", "#60a5fa", "#f87171", "#e5e7eb"].map((c) => (
          <span key={c} className="mx-auto size-8 rounded-[9px] opacity-80" style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

/** Browser window showing the install prompt that Chrome and Edge offer. */
export function DesktopInstallPrompt() {
  return (
    <BrowserWindow url="mail.acme.example/w/acme/inbox" installHint className="w-full max-w-[400px]">
      <div className="relative h-[210px] bg-background">
        <div className="space-y-2 p-4 opacity-45">
          <Line w="40%" />
          <Line w="92%" />
          <Line w="84%" />
          <Line w="88%" />
          <Line w="60%" />
        </div>
        <Panel className="absolute top-2 right-3 w-[220px] p-3 text-[11px]">
          <div className="font-semibold">Install app?</div>
          <div className="mt-2.5 flex items-center gap-2">
            <LogoMark className="size-7" title="" />
            <div className="min-w-0">
              <div className="font-medium">Dispatch</div>
              <div className="truncate text-[10px] text-muted-foreground">mail.acme.example</div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-1.5">
            <span className="rounded-[4px] border border-border px-2 py-1 text-[10.5px] font-medium">Cancel</span>
            <span className="rounded-[4px] bg-primary px-2 py-1 text-[10.5px] font-medium text-primary-foreground">Install</span>
          </div>
        </Panel>
      </div>
    </BrowserWindow>
  )
}

/** A browser notification for a mention. */
export function NotificationToast() {
  return (
    <div className="w-full max-w-[320px] space-y-2 text-[11.5px]">
      <Panel className="flex gap-2.5 p-3">
        <LogoMark className="size-7" title="" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Jonas mentioned you</span>
            <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">now</span>
          </div>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            “@Maya can you refund the duplicate charge?” in Invoice #4821
          </p>
        </div>
      </Panel>
      <Panel className="flex items-center gap-2.5 p-3 opacity-70">
        <Bell className="size-4 text-muted-foreground" />
        <span className="flex-1">“Refund for order #1042” was assigned to you</span>
        <span className="font-mono text-[9.5px] text-muted-foreground">2m</span>
      </Panel>
    </div>
  )
}
