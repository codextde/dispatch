"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "motion/react"
import {
  AlarmClock,
  Archive,
  AtSign,
  ChevronDown,
  CornerUpLeft,
  FileText,
  Inbox,
  Lock,
  Search,
  Send,
  Star,
  UserRound,
} from "lucide-react"
import { Avatar, Contact, Label, Mention, TypingDots, labelColors, type PersonKey } from "./visuals/ui"
import { cn } from "@/lib/utils"

type Row = {
  id: string
  initials: string
  name: string
  subject: string
  snippet: string
  time: string
  labels?: [string, string][]
  assignee?: PersonKey
  unread?: boolean
}

const rows: Row[] = [
  {
    id: "hl",
    initials: "HL",
    name: "Hannah Lee",
    subject: "Invoice #4821 was charged twice",
    snippet: "Hi team, I just noticed our card was charged…",
    time: "9:41",
    labels: [
      ["Billing", labelColors.billing],
      ["VIP", labelColors.vip],
    ],
  },
  {
    id: "ok",
    initials: "OK",
    name: "Omar Khan",
    subject: "Refund for order #1042",
    snippet: "The package arrived damaged, could you…",
    time: "9:12",
    labels: [["Urgent", labelColors.urgent]],
    assignee: "jonas",
    unread: true,
  },
  {
    id: "rb",
    initials: "RB",
    name: "Rosa Brandt",
    subject: "Adding two seats to our plan",
    snippet: "We're growing the team next month and…",
    time: "8:57",
    assignee: "priya",
  },
  {
    id: "ts",
    initials: "TS",
    name: "Tom Silva",
    subject: "Quote for 40 units",
    snippet: "Following up on our call, could you send…",
    time: "Tue",
    labels: [["Lead", labelColors.lead]],
    assignee: "leo",
  },
  {
    id: "no",
    initials: "NO",
    name: "Nadia Okafor",
    subject: "Password reset link expired",
    snippet: "I tried the link twice but it says it has…",
    time: "Tue",
    labels: [["Bug", labelColors.bug]],
  },
]

const incoming: Row = {
  id: "rs",
  initials: "RS",
  name: "Ravi Singh",
  subject: "Can we move our renewal date?",
  snippet: "Our fiscal year starts in April, so ideally…",
  time: "now",
  unread: true,
}

/** Timeline of the loop, in ms from the start. */
const TIMELINE = [1400, 3000, 4300, 6600, 11500]

export function HeroInbox() {
  const reduce = useReducedMotion()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (reduce) return
    let timers: ReturnType<typeof setTimeout>[] = []
    const schedule = () => {
      timers = TIMELINE.map((t, i) =>
        setTimeout(() => {
          if (i === TIMELINE.length - 1) {
            setTick(0)
            schedule()
          } else setTick(i + 1)
        }, t),
      )
    }
    schedule()
    return () => timers.forEach(clearTimeout)
  }, [reduce])

  // Reduced motion: show the finished state without looping.
  const step = reduce ? 4 : tick
  const list = step >= 1 ? [incoming, ...rows] : rows
  const assigned = step >= 2

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="mk-glow">
          <div className="rounded-[14px] border border-black/10 bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]">
            {/* window chrome */}
            <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="mx-auto hidden items-center gap-1.5 rounded-[5px] bg-white/[0.06] px-3 py-1 font-mono text-[10.5px] text-white/50 sm:flex">
                <Lock className="size-2.5" /> mail.acme.example/w/acme/inbox
              </span>
              <span className="ml-auto size-2.5 sm:ml-0 sm:w-[46px]" />
            </div>

            <div
              className="mk-dark grid h-[540px] grid-cols-1 grid-rows-1 overflow-hidden rounded-[9px] border border-white/[0.07] text-[12px] md:grid-cols-[272px_1fr] lg:grid-cols-[188px_288px_1fr]"
              aria-hidden
            >
              {/* Sidebar */}
              <aside className="hidden flex-col gap-4 border-r border-border bg-[#191919] p-3 lg:flex">
                <div className="flex items-center gap-2 px-1">
                  <span className="flex size-6 items-center justify-center rounded-[6px] bg-brand text-[11px] font-bold text-[#07210f]">
                    A
                  </span>
                  <span className="font-semibold">Acme Inc</span>
                  <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 rounded-[6px] border border-border bg-white/[0.03] px-2 py-1.5 text-muted-foreground">
                  <Search className="size-3.5" />
                  <span className="flex-1">Search</span>
                  <span className="font-mono text-[10px]">⌘K</span>
                </div>
                <nav className="space-y-0.5">
                  <SideItem icon={<Inbox className="size-3.5" />} label="Inbox" count={step >= 1 ? 13 : 12} active />
                  <SideItem icon={<UserRound className="size-3.5" />} label="Assigned to me" count={assigned ? 5 : 4} />
                  <SideItem icon={<AtSign className="size-3.5" />} label="Mentions" count={2} />
                  <SideItem icon={<AlarmClock className="size-3.5" />} label="Snoozed" />
                  <SideItem icon={<Send className="size-3.5" />} label="Sent" />
                  <SideItem icon={<FileText className="size-3.5" />} label="Drafts" />
                </nav>
                <div>
                  <SideHeading>Team inboxes</SideHeading>
                  <SideItem dot="#4ade80" label="Support" count={8} />
                  <SideItem dot="#60a5fa" label="Sales" count={3} />
                  <SideItem dot="#fbbf24" label="Billing" count={1} />
                </div>
                <div>
                  <SideHeading>Labels</SideHeading>
                  <SideItem dot={labelColors.urgent} label="Urgent" />
                  <SideItem dot={labelColors.vip} label="VIP" />
                  <SideItem dot={labelColors.bug} label="Bug" />
                </div>
                <div className="mt-auto flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                  <span className="flex -space-x-1.5">
                    <Avatar who="maya" size={18} className="ring-2 ring-[#191919]" />
                    <Avatar who="jonas" size={18} className="ring-2 ring-[#191919]" />
                    <Avatar who="priya" size={18} className="ring-2 ring-[#191919]" />
                  </span>
                  3 online
                </div>
              </aside>

              {/* Conversation list */}
              <section className="hidden min-w-0 flex-col border-r border-border md:flex">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
                  <span className="text-[13px] font-semibold">Support</span>
                  <span className="flex gap-1 text-[10.5px]">
                    <span className="rounded-[4px] bg-white/[0.08] px-1.5 py-0.5 font-medium">Open</span>
                    <span className="px-1.5 py-0.5 text-muted-foreground">Assigned</span>
                    <span className="px-1.5 py-0.5 text-muted-foreground">Closed</span>
                  </span>
                </div>
                <ul className="flex-1 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {list.map((r) => (
                      <m.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{
                          duration: 0.45,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <ListRow
                          row={r}
                          selected={r.id === "hl"}
                          assignee={r.id === "hl" && assigned ? "maya" : r.assignee}
                        />
                      </m.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>

              {/* Open conversation */}
              <section className="flex min-w-0 flex-col">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[13.5px] font-semibold">Invoice #4821 was charged twice</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Label name="Billing" color={labelColors.billing} />
                      <Label name="VIP" color={labelColors.vip} />
                      <AnimatePresence mode="popLayout" initial={false}>
                        {assigned ? (
                          <m.span
                            key="assigned"
                            initial={{ opacity: 0, scale: 0.8, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{
                              type: "spring",
                              stiffness: 420,
                              damping: 26,
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand-soft py-px pr-2 pl-px text-[10.5px] font-medium text-(--brand-ink)"
                          >
                            <Avatar who="maya" size={15} /> Maya
                          </m.span>
                        ) : (
                          <m.span
                            key="unassigned"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2 py-px text-[10.5px] text-muted-foreground"
                          >
                            <UserRound className="size-2.5" /> Unassigned
                          </m.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-[10.5px] text-muted-foreground sm:inline">Viewing</span>
                    <span className="flex -space-x-1.5">
                      <Avatar who="maya" size={22} className="ring-2 ring-background" />
                      <Avatar who="jonas" size={22} className="ring-2 ring-background" />
                    </span>
                    <span className="hidden gap-1 text-muted-foreground sm:flex">
                      <Archive className="size-3.5" />
                      <Star className="size-3.5" />
                    </span>
                  </div>
                </header>

                <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-3.5">
                  {/* Email */}
                  <div className="rounded-[8px] border border-border bg-card p-3">
                    <div className="flex items-center gap-2.5">
                      <Contact initials="HL" size={26} className="bg-white/10 text-white/70" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold">Hannah Lee</span>
                          <span className="text-[10.5px] text-muted-foreground">9:41 AM</span>
                        </div>
                        <div className="truncate text-[10.5px] text-muted-foreground">
                          hannah@northwind.example → support@acme.example
                        </div>
                      </div>
                    </div>
                    <p className="mt-2.5 leading-relaxed text-foreground/85">
                      Hi team, I just noticed our card was charged twice for invoice #4821 this morning. Could you
                      refund the duplicate? Thanks, Hannah
                    </p>
                  </div>

                  {/* Activity */}
                  <AnimatePresence initial={false}>
                    {assigned && (
                      <m.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 px-1 text-[10.5px] text-muted-foreground"
                      >
                        <span className="h-px flex-1 bg-border" />
                        <Avatar who="jonas" size={14} /> Jonas assigned this to Maya · just now
                        <span className="h-px flex-1 bg-border" />
                      </m.div>
                    )}
                  </AnimatePresence>

                  {/* Internal thread */}
                  <div className="space-y-2.5 rounded-[8px] border border-brand/20 bg-brand/[0.06] p-3">
                    <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-brand/80">
                      <Lock className="size-2.5" /> Internal comments
                    </div>
                    <Comment who="jonas" name="Jonas" time="2m">
                      <Mention>@Maya</Mention> can you take this one? They&apos;re on the annual plan.
                    </Comment>
                    <AnimatePresence initial={false} mode="popLayout">
                      {step === 3 && (
                        <m.div
                          key="typing"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2 text-[11px] text-muted-foreground"
                        >
                          <Avatar who="maya" size={20} />
                          <span>Maya is typing</span>
                          <TypingDots />
                        </m.div>
                      )}
                      {step >= 4 && (
                        <m.div
                          key="reply"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{
                            duration: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <Comment who="maya" name="Maya" time="now">
                            On it. Refunding the duplicate now, I&apos;ll reply to Hannah in a minute.
                          </Comment>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Composer */}
                <div className="border-t border-border p-3">
                  <div className="rounded-[8px] border border-border bg-white/[0.03] px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CornerUpLeft className="size-3.5" />
                      <span className="flex-1">Reply to Hannah…</span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <kbd className="rounded-[3px] border border-border px-1 font-mono text-[9.5px]">C</kbd> comment
                        <kbd className="ml-1.5 rounded-[3px] border border-border px-1 font-mono text-[9.5px]">
                          R
                        </kbd>{" "}
                        reply
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
                        <Send className="size-3" /> Send
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}

function SideHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{children}</div>
  )
}

function SideItem({
  icon,
  dot,
  label,
  count,
  active,
}: {
  icon?: React.ReactNode
  dot?: string
  label: string
  count?: number
  active?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[5px] px-2 py-1",
        active ? "bg-white/[0.08] font-medium text-foreground" : "text-foreground/70",
      )}
    >
      {icon ?? <span className="mx-1 size-1.5 rounded-full" style={{ background: dot }} />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{count}</span>}
    </div>
  )
}

function ListRow({ row, selected, assignee }: { row: Row; selected: boolean; assignee?: PersonKey }) {
  return (
    <div className={cn("relative flex gap-2.5 border-b border-border px-3.5 py-2.5", selected && "bg-white/[0.05]")}>
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand" />}
      <Contact initials={row.initials} size={26} className="bg-white/10 text-white/70" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate", row.unread ? "font-semibold" : "font-medium")}>{row.name}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {row.time === "now" && <span className="size-1.5 rounded-full bg-brand" />}
            {row.time}
          </span>
        </div>
        <div className={cn("truncate text-[11.5px]", row.unread ? "text-foreground" : "text-foreground/80")}>
          {row.subject}
        </div>
        <div className="truncate text-[10.5px] text-muted-foreground">{row.snippet}</div>
        {(row.labels || assignee) && (
          <div className="mt-1.5 flex items-center gap-1">
            {row.labels?.map(([n, c]) => (
              <Label key={n} name={n} color={c} />
            ))}
            {assignee && <Avatar who={assignee} size={16} className="ml-auto" />}
          </div>
        )}
      </div>
    </div>
  )
}

function Comment({
  who,
  name,
  time,
  children,
}: {
  who: PersonKey
  name: string
  time: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      <Avatar who={who} size={20} />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold">
          {name} <span className="font-normal text-muted-foreground">· {time}</span>
        </div>
        <p className="leading-snug text-foreground/90">{children}</p>
      </div>
    </div>
  )
}
