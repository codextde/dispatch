import {
  Archive,
  Check,
  CircleDot,
  Inbox,
  KeyRound,
  Mail,
  Minus,
  RotateCw,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { Avatar, Contact, Label, Panel, labelColors } from "./ui"

/** Dark terminal-ish code card, used for API and self-hosting mocks. */
function CodeCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-[8px] border border-white/10 bg-[#161616] text-[10.5px] text-[#e7e5e0] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[9.5px] text-white/45">{title}</span>
      </div>
      <pre className="overflow-hidden p-3 font-mono leading-[1.65] whitespace-pre">{children}</pre>
    </div>
  )
}

const c = {
  k: "text-[#4ade80]",
  s: "text-[#fcd34d]",
  m: "text-white/40",
  p: "text-[#93c5fd]",
}

export function ApiVisual() {
  return (
    <CodeCard title="api.sh">
      <span className={c.m}>$</span> curl <span className={c.s}>https://mail.acme.example/api/w/acme/conversations</span> \{"\n"}
      {"  "}-H <span className={c.s}>&quot;Authorization: Bearer dsp_…&quot;</span>
      {"\n\n"}
      {"{ "}
      <span className={c.p}>&quot;items&quot;</span>: [{"{"}
      {"\n"}
      {"    "}
      <span className={c.p}>&quot;id&quot;</span>: <span className={c.s}>&quot;5f0c6b8e-…&quot;</span>,{"\n"}
      {"    "}
      <span className={c.p}>&quot;subject&quot;</span>: <span className={c.s}>&quot;Refund for order #1042&quot;</span>,{"\n"}
      {"    "}
      <span className={c.p}>&quot;status&quot;</span>: <span className={c.k}>&quot;open&quot;</span>,{"\n"}
      {"    "}
      <span className={c.p}>&quot;labels&quot;</span>: [<span className={c.s}>&quot;Billing&quot;</span>]{"\n"}
      {"  }], "}
      <span className={c.p}>&quot;nextCursor&quot;</span>: <span className={c.m}>null</span> {"}"}
    </CodeCard>
  )
}

export function WebhooksVisual() {
  const events = [
    { e: "conversation.created", s: 200, t: "84ms" },
    { e: "conversation.assigned", s: 200, t: "61ms" },
    { e: "comment.created", s: 200, t: "72ms" },
    { e: "message.sent", s: 503, t: "retry 1/5" },
  ]
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">POST https://hooks.acme.example/dispatch</span>
      </div>
      <ul className="divide-y divide-border">
        {events.map((ev) => (
          <li key={ev.e} className="flex items-center gap-2 px-3 py-2">
            <span
              className={`rounded-[3px] px-1 font-mono text-[9.5px] font-semibold ${ev.s === 200 ? "bg-brand-soft text-(--brand-ink)" : "bg-[#f59e0b]/15 text-[#b45309]"}`}
            >
              {ev.s}
            </span>
            <span className="flex-1 font-mono text-[10.5px]">{ev.e}</span>
            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-muted-foreground">
              {ev.s !== 200 && <RotateCw className="size-2.5" />}
              {ev.t}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-border bg-surface/60 px-3 py-1.5 font-mono text-[9.5px] text-muted-foreground">
        X-Dispatch-Signature: t=1759…,v1=5f2c…
      </div>
    </Panel>
  )
}

export function SecurityVisual() {
  const perms = [
    { l: "Read team inboxes", on: true },
    { l: "Reply & comment", on: true },
    { l: "Manage rules", on: true },
    { l: "Manage members", on: false },
    { l: "Billing", on: false },
  ]
  return (
    <Panel className="w-full max-w-[320px] overflow-hidden text-[11.5px]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <ShieldCheck className="size-3.5 text-(--brand-ink)" />
        <span className="font-semibold">Role: Support lead</span>
        <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">custom</span>
      </div>
      <ul className="p-1.5">
        {perms.map((p) => (
          <li key={p.l} className="flex items-center justify-between rounded-[5px] px-1.5 py-1.5">
            <span className={p.on ? "font-medium" : "text-muted-foreground"}>{p.l}</span>
            <span
              className={`flex h-3.5 w-6 items-center rounded-full p-px transition-colors ${p.on ? "justify-end bg-brand" : "justify-start bg-surface-2"}`}
            >
              <span className="size-3 rounded-full bg-white shadow-sm" />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function AuditVisual() {
  const rows = [
    { who: "maya" as const, a: "inbox.connected", t: "09:12" },
    { who: "jonas" as const, a: "member.role_changed", t: "09:40" },
    { who: "priya" as const, a: "session.revoked", t: "10:05" },
    { who: "leo" as const, a: "rule.updated", t: "10:31" },
  ]
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-semibold">Audit log</span>
        <span className="font-mono text-[9.5px] text-muted-foreground">Today</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.a} className="flex items-center gap-2 px-3 py-2">
            <span className="w-9 font-mono text-[9.5px] text-muted-foreground">{r.t}</span>
            <Avatar who={r.who} size={16} />
            <span className="flex-1 truncate font-mono text-[10.5px]">{r.a}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function SelfHostVisual() {
  return (
    <CodeCard title="/opt/dispatch">
      <span className={c.m}>$</span> curl -fsSLO <span className={c.s}>…/dispatch/main/docker-compose.yml</span>
      {"\n"}
      <span className={c.m}>$</span> echo <span className={c.s}>&quot;DOMAIN=mail.acme.example&quot;</span> &gt; .env{"\n"}
      <span className={c.m}>$</span> docker compose up -d{"\n"}
      <span className={c.k}>✔</span> Container dispatch-db-1{"      "}
      <span className={c.m}>Healthy</span>
      {"\n"}
      <span className={c.k}>✔</span> Container dispatch-app-1{"     "}
      <span className={c.m}>Started</span>
      {"\n"}
      <span className={c.k}>✔</span> Container dispatch-worker-1{"  "}
      <span className={c.m}>Started</span>
      {"\n\n"}
      <span className={c.p}>→</span> Open https://mail.acme.example/setup
    </CodeCard>
  )
}

export function ProvidersVisual() {
  const rows = [
    { l: "Google", d: "Gmail & Google Workspace", g: "G", ok: true },
    { l: "Microsoft", d: "Outlook & Microsoft 365", g: "M", ok: true },
    { l: "IMAP / SMTP", d: "Fastmail, iCloud, Zoho, any host", g: "@" },
  ]
  return (
    <Panel className="w-full max-w-[340px] p-1.5 text-[11.5px]">
      <div className="px-2 pt-1 pb-2 font-semibold">Connect a mailbox</div>
      {rows.map((r) => (
        <div key={r.l} className="flex items-center gap-2.5 rounded-[6px] px-2 py-2 hover:bg-accent">
          <span className="flex size-7 items-center justify-center rounded-[6px] border border-border bg-surface font-mono text-[12px] font-semibold">
            {r.g}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.l}</div>
            <div className="truncate text-[10px] text-muted-foreground">{r.d}</div>
          </div>
          {r.ok ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-(--brand-ink)">
              <Check className="size-3" /> Connected
            </span>
          ) : (
            <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] font-medium">Connect</span>
          )}
        </div>
      ))}
    </Panel>
  )
}

export function AiVisual() {
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Sparkles className="size-3.5 text-(--brand-ink)" />
        <span className="font-semibold">Assistant</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px font-mono text-[9px] text-muted-foreground">
          <KeyRound className="size-2.5" /> your API key
        </span>
      </div>
      <div className="p-3">
        <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Summary</div>
        <ul className="mt-1.5 space-y-1">
          {[
            "Customer was charged twice for invoice #4821",
            "Jonas asked Maya to handle it",
            "Refund of the duplicate charge is pending",
          ].map((s) => (
            <li key={s} className="flex gap-1.5">
              <Minus className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              {s}
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-[6px] border border-border bg-surface/70 p-2.5 leading-relaxed">
          <div className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Suggested reply</div>
          Hi Hannah, sorry about that. We&apos;ve refunded the duplicate charge and updated your invoice…
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-[4px] bg-primary px-2 py-1 text-[10.5px] font-medium text-primary-foreground">Insert</span>
          <span className="rounded-[4px] border border-border px-2 py-1 text-[10.5px] font-medium">Friendlier</span>
          <span className="rounded-[4px] border border-border px-2 py-1 text-[10.5px] font-medium">Translate</span>
        </div>
      </div>
    </Panel>
  )
}

export function MobileVisual() {
  const rows = [
    { i: "HL", n: "Hannah Lee", s: "Invoice #4821 was charged…", who: "maya" as const, unread: true },
    { i: "OK", n: "Omar Khan", s: "Refund for order #1042", who: "jonas" as const, unread: true },
    { i: "RB", n: "Rosa Brandt", s: "Adding two seats", who: "priya" as const },
    { i: "TS", n: "Tom Silva", s: "Quote for 40 units", who: "leo" as const },
  ]
  return (
    <div className="w-[196px] rounded-[30px] border-[5px] border-[#141414] bg-[#141414] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]">
      <div className="overflow-hidden rounded-[25px] bg-background text-[10px]">
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1 font-mono text-[8.5px] font-semibold">
          <span>9:41</span>
          <span className="h-3.5 w-12 rounded-full bg-[#141414]" />
          <span>5G</span>
        </div>
        <div className="flex items-center justify-between px-3 pt-1 pb-2">
          <span className="text-[13px] font-semibold tracking-tight">Support</span>
          <Avatar who="maya" size={18} />
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li key={r.n} className="flex items-center gap-2 px-3 py-2">
              <Contact initials={r.i} size={22} />
              <div className="min-w-0 flex-1">
                <div className={`truncate ${r.unread ? "font-semibold" : "font-medium"}`}>{r.n}</div>
                <div className="truncate text-[9px] text-muted-foreground">{r.s}</div>
              </div>
              <Avatar who={r.who} size={13} />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-around border-t border-border px-2 pt-2 pb-3 text-muted-foreground">
          <Inbox className="size-3.5 text-foreground" />
          <Users className="size-3.5" />
          <CircleDot className="size-3.5" />
          <Archive className="size-3.5" />
        </div>
      </div>
    </div>
  )
}

export function InboxVisual() {
  const inboxes = [
    { n: "Support", c: 12, active: true },
    { n: "Sales", c: 4 },
    { n: "Billing", c: 2 },
  ]
  const rows = [
    { i: "HL", n: "Hannah Lee", s: "Invoice #4821 was charged twice", who: "maya" as const, l: ["Billing", labelColors.billing] },
    { i: "OK", n: "Omar Khan", s: "Refund for order #1042", who: "jonas" as const, l: ["Urgent", labelColors.urgent] },
    { i: "RB", n: "Rosa Brandt", s: "Adding two seats to our plan", who: "priya" as const },
  ] as const
  return (
    <Panel className="flex w-full max-w-[360px] overflow-hidden text-[11px]">
      <div className="w-[92px] shrink-0 border-r border-border bg-surface/60 p-1.5">
        <div className="px-1.5 pt-1 pb-1.5 font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground">Team</div>
        {inboxes.map((ib) => (
          <div
            key={ib.n}
            className={`flex items-center justify-between rounded-[4px] px-1.5 py-1 ${ib.active ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
          >
            <span className="inline-flex items-center gap-1">
              <Mail className="size-2.5" />
              {ib.n}
            </span>
            <span className="font-mono text-[9px]">{ib.c}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-1 px-1.5 text-[9px] text-muted-foreground">
          <Server className="size-2.5" /> IMAP
        </div>
      </div>
      <ul className="min-w-0 flex-1 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.n} className="flex items-start gap-2 px-2.5 py-2">
            <Contact initials={r.i} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-semibold">{r.n}</span>
                <Avatar who={r.who} size={14} />
              </div>
              <div className="truncate text-[10px] text-muted-foreground">{r.s}</div>
              {"l" in r && <Label className="mt-1" name={r.l[0]} color={r.l[1]} />}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
