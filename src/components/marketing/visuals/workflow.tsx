import { useId } from "react"
import {
  AlarmClock,
  ArrowDown,
  CalendarClock,
  ChevronDown,
  Clock,
  CornerUpLeft,
  Paperclip,
  Search,
  Send,
  Undo2,
  Zap,
} from "lucide-react"
import { Avatar, Contact, Key, Label, Line, Panel, labelColors } from "./ui"

export function RulesVisual() {
  const steps = [
    { tag: "When", body: <>A new email arrives in <b className="font-semibold">billing@</b></> },
    {
      tag: "If",
      body: (
        <>
          Subject contains <code className="rounded-[3px] bg-surface px-1 font-mono text-[10px]">invoice</code>
        </>
      ),
    },
    {
      tag: "Then",
      body: (
        <span className="flex flex-wrap gap-1">
          <Label name="Billing" color={labelColors.billing} />
          <span className="inline-flex items-center gap-1 rounded-[4px] border border-border bg-card px-1.5 py-px text-[10.5px] font-medium">
            <Avatar who="priya" size={12} /> Assign Priya
          </span>
        </span>
      ),
    },
  ]
  return (
    <div className="w-full max-w-[320px] text-[11.5px]">
      {steps.map((s, i) => (
        <div key={s.tag}>
          <Panel className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-9 shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-(--brand-ink)">
              {s.tag}
            </span>
            <span className="min-w-0 flex-1">{s.body}</span>
            {i === 0 && <Zap className="size-3.5 text-muted-foreground" />}
          </Panel>
          {i < steps.length - 1 && (
            <div className="flex h-5 justify-center">
              <span className="w-px bg-border" />
            </div>
          )}
        </div>
      ))}
      <div className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[9.5px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-brand" /> Ran 128 times this week
      </div>
    </div>
  )
}

export function CannedVisual() {
  const items = [
    { name: "Refund approved", hint: "/refund", active: true },
    { name: "Refund policy", hint: "/policy" },
    { name: "Shipping delay", hint: "/delay" },
  ]
  return (
    <div className="w-full max-w-[340px] text-[11.5px]">
      <Panel className="p-3">
        <div className="text-muted-foreground">
          Hi Hannah, <span className="text-foreground">/ref</span>
          <span className="mk-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-foreground" />
        </div>
      </Panel>
      <Panel className="mt-1.5 w-[88%] overflow-hidden">
        <ul className="p-1">
          {items.map((it) => (
            <li
              key={it.name}
              className={`flex items-center justify-between rounded-[5px] px-2 py-1.5 ${it.active ? "bg-accent" : ""}`}
            >
              <span className="font-medium">{it.name}</span>
              <span className="font-mono text-[9.5px] text-muted-foreground">{it.hint}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border bg-surface/60 px-3 py-2 leading-relaxed text-muted-foreground">
          Hi <Var>first_name</Var>, your refund of <Var>amount</Var> is on its way and should arrive within 5 business
          days.
        </div>
      </Panel>
    </div>
  )
}

function Var({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[3px] bg-brand-soft px-0.5 font-mono text-[10px] text-(--brand-ink)">{`{{${children}}}`}</span>
}

export function LabelsVisual() {
  const labels = [
    { name: "Urgent", c: labelColors.urgent, n: 3 },
    { name: "VIP", c: labelColors.vip, n: 8 },
    { name: "Billing", c: labelColors.billing, n: 14 },
    { name: "Bug", c: labelColors.bug, n: 5 },
    { name: "Lead", c: labelColors.lead, n: 21 },
  ]
  return (
    <div className="w-full max-w-[340px] text-[11.5px]">
      <Panel className="flex items-center gap-2.5 p-3">
        <Contact initials="RB" size={26} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Rosa Brandt</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Label name="VIP" color={labelColors.vip} />
            <Label name="Billing" color={labelColors.billing} />
            <span className="rounded-[4px] border border-dashed border-foreground/25 px-1.5 text-[10.5px] text-muted-foreground">
              + label
            </span>
          </div>
        </div>
      </Panel>
      <Panel className="mt-2 p-1.5">
        {labels.map((l) => (
          <div key={l.name} className="flex items-center gap-2 rounded-[5px] px-1.5 py-1">
            <span className="size-2 rounded-full" style={{ background: l.c }} />
            <span className="flex-1 font-medium">{l.name}</span>
            <span className="font-mono text-[9.5px] text-muted-foreground">{l.n}</span>
          </div>
        ))}
      </Panel>
    </div>
  )
}

export function SnoozeVisual() {
  const options = [
    { l: "Later today", t: "6:00 PM" },
    { l: "Tomorrow", t: "9:00 AM", active: true },
    { l: "Next Monday", t: "9:00 AM" },
    { l: "When they reply", t: "" },
  ]
  return (
    <Panel className="w-full max-w-[300px] p-1.5 text-[11.5px]">
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-2 font-semibold">
        <AlarmClock className="size-3.5 text-(--brand-ink)" /> Snooze until…
        <Key className="ml-auto">H</Key>
      </div>
      {options.map((o) => (
        <div
          key={o.l}
          className={`flex items-center justify-between rounded-[5px] px-2 py-1.5 ${o.active ? "bg-accent" : ""}`}
        >
          <span className="font-medium">{o.l}</span>
          <span className="text-muted-foreground">{o.t}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1.5 border-t border-border px-2 pt-2 pb-1 text-muted-foreground">
        <CalendarClock className="size-3.5" /> Pick date &amp; time
      </div>
    </Panel>
  )
}

export function SendLaterVisual() {
  return (
    <div className="w-full max-w-[320px] text-[11.5px]">
      <Panel className="p-3">
        <div className="space-y-1.5">
          <Line w="86%" />
          <Line w="70%" />
          <Line w="40%" />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-[10px] text-muted-foreground">Tomorrow, 8:00 AM</span>
          <span className="inline-flex overflow-hidden rounded-[4px] bg-primary text-[10.5px] font-medium text-primary-foreground">
            <span className="inline-flex items-center gap-1 px-2 py-1">
              <Clock className="size-3" /> Send later
            </span>
            <span className="border-l border-primary-foreground/20 px-1.5 py-1">
              <ChevronDown className="size-3" />
            </span>
          </span>
        </div>
      </Panel>
      <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[#141414] px-3 py-2 text-[#f5f4f0] shadow-lg">
        <Send className="size-3.5 text-[#4ade80]" />
        <span className="flex-1">Sending in 8s…</span>
        <span className="inline-flex items-center gap-1 font-medium text-[#4ade80]">
          <Undo2 className="size-3" /> Undo
        </span>
      </div>
    </div>
  )
}

export function AnalyticsVisual() {
  const gradientId = `mk-area-${useId().replace(/:/g, "")}`
  const points = [34, 30, 38, 29, 26, 31, 24, 22, 25, 19, 21, 17]
  const max = 40
  const w = 280
  const h = 64
  const step = w / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(" ")
  const load = [
    { who: "maya" as const, v: 0.82 },
    { who: "jonas" as const, v: 0.64 },
    { who: "priya" as const, v: 0.45 },
  ]
  return (
    <Panel className="w-full max-w-[340px] p-3 text-[11.5px]">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Median first reply</div>
          <div className="mt-0.5 text-[20px] font-semibold tracking-tight">
            42m <span className="text-[11px] font-medium text-(--brand-ink)">↓ 18%</span>
          </div>
        </div>
        <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">Last 30 days</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 4}`} className="mt-2 h-16 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${w},${h + 4} L0,${h + 4} Z`} fill={`url(#${gradientId})`} />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-3 space-y-1.5">
        {load.map((l) => (
          <div key={l.who} className="flex items-center gap-2">
            <Avatar who={l.who} size={16} />
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${l.v * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function ShortcutsVisual() {
  const keys = [
    { k: "E", l: "Archive" },
    { k: "R", l: "Reply" },
    { k: "A", l: "Assign" },
    { k: "H", l: "Snooze" },
    { k: "C", l: "Comment" },
    { k: "⌘K", l: "Command" },
  ]
  return (
    <div className="grid w-full max-w-[300px] grid-cols-3 gap-2 text-[11px]">
      {keys.map((k) => (
        <div key={k.k} className="flex flex-col items-center gap-1.5">
          <span className="flex h-12 w-full items-center justify-center rounded-[7px] border border-border bg-card font-mono text-[15px] font-semibold shadow-[0_2px_0_var(--border),0_6px_14px_-8px_rgba(0,0,0,0.25)]">
            {k.k}
          </span>
          <span className="text-muted-foreground">{k.l}</span>
        </div>
      ))}
    </div>
  )
}

export function SignaturesVisual() {
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="space-y-1.5 p-3">
        <Line w="90%" />
        <Line w="76%" />
      </div>
      <div className="mx-3 border-t border-dashed border-border py-3">
        <div className="font-semibold">Maya Chen</div>
        <div className="text-muted-foreground">Customer Success · Northwind</div>
        <div className="mt-1 text-muted-foreground">support@northwind.example</div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface/60 px-3 py-2">
        <span className="text-muted-foreground">Signature</span>
        <span className="inline-flex items-center gap-1 rounded-[4px] border border-border bg-card px-1.5 py-0.5 font-medium">
          Support team <ChevronDown className="size-3" />
        </span>
      </div>
    </Panel>
  )
}

export function SearchVisual() {
  const results = [
    { s: "Invoice #4821 was charged twice", f: "Hannah Lee", a: true },
    { s: "Updated invoice for September", f: "Northwind Billing", a: true },
    { s: "Invoice address change", f: "Rosa Brandt", a: false },
  ]
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 text-muted-foreground" />
        <Token>from:hannah</Token>
        <Token>label:billing</Token>
        <span>invoice</span>
      </div>
      <ul className="p-1">
        {results.map((r) => (
          <li key={r.s} className="flex items-center gap-2 rounded-[5px] px-2 py-1.5 first:bg-accent">
            <CornerUpLeft className="size-3 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                <mark className="rounded-[2px] bg-brand-soft px-px text-inherit">Invoice</mark>
                {r.s.slice(7)}
              </div>
              <div className="text-[10px] text-muted-foreground">{r.f}</div>
            </div>
            {r.a && <Paperclip className="size-3 text-muted-foreground" />}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <ArrowDown className="size-3" /> 3 results in 18ms
      </div>
    </Panel>
  )
}

function Token({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[4px] bg-surface-2 px-1.5 py-px font-mono text-[10px]">{children}</span>
}
