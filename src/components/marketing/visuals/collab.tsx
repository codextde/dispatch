import { AtSign, Bold, Check, CircleCheck, Hash, Italic, Link2, Lock, Mail, Search, Send } from "lucide-react"
import { Avatar, Contact, Label, Line, Mention, Panel, TypingDots, labelColors, people } from "./ui"

export function CommentsVisual() {
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-start gap-2.5 border-b border-border p-3">
        <Contact initials="HL" size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">Hannah Lee</span>
            <span className="text-[10px] text-muted-foreground">9:41</span>
          </div>
          <div className="truncate text-muted-foreground">Re: Invoice #4821 was charged twice</div>
          <div className="mt-2 space-y-1">
            <Line w="92%" />
            <Line w="64%" />
          </div>
        </div>
      </div>
      <div className="space-y-2.5 bg-[color-mix(in_srgb,var(--brand)_7%,var(--card))] p-3">
        <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          <Lock className="size-3" /> Internal · only your team sees this
        </div>
        <div className="flex gap-2">
          <Avatar who="jonas" size={22} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold">
              Jonas <span className="font-normal text-muted-foreground">· 2m</span>
            </div>
            <p className="leading-snug">
              <Mention>@Maya</Mention> can you take this? They&apos;re on the annual plan.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Avatar who="maya" size={22} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold">
              Maya <span className="font-normal text-muted-foreground">· just now</span>
            </div>
            <p className="leading-snug">On it. I&apos;ll refund the duplicate charge.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-[6px] border border-border bg-card px-2 py-1.5 text-muted-foreground">
          <AtSign className="size-3" />
          <span className="flex-1">Comment or @mention…</span>
          <span className="inline-flex items-center gap-1 text-[10px]">
            <Avatar who="priya" size={14} /> Priya is typing <TypingDots />
          </span>
        </div>
      </div>
    </Panel>
  )
}

export function AssignVisual() {
  const team = [
    { key: "maya" as const, load: 4, checked: true },
    { key: "jonas" as const, load: 7 },
    { key: "priya" as const, load: 2 },
    { key: "leo" as const, load: 5 },
  ]
  return (
    <div className="relative w-full max-w-[340px] pb-2 text-[11.5px]">
      <Panel className="flex items-center gap-2.5 p-3">
        <Contact initials="OK" size={26} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Omar Khan</div>
          <div className="truncate text-muted-foreground">Refund for order #1042</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-2 pl-0.5 text-[10.5px] font-medium">
          <Avatar who="maya" size={16} /> Maya
        </span>
      </Panel>
      <Panel className="relative mt-2 ml-auto w-[78%] p-1.5">
        <div className="flex items-center gap-1.5 border-b border-border px-1.5 pb-1.5 text-muted-foreground">
          <Search className="size-3" /> Assign to…
        </div>
        <ul className="pt-1">
          {team.map((t) => (
            <li
              key={t.key}
              className={`flex items-center gap-2 rounded-[5px] px-1.5 py-1 ${t.checked ? "bg-accent" : ""}`}
            >
              <Avatar who={t.key} size={18} />
              <span className="flex-1 font-medium">{people[t.key].name}</span>
              <span className="font-mono text-[9.5px] text-muted-foreground">{t.load} open</span>
              {t.checked ? <Check className="size-3 text-(--brand-ink)" /> : <span className="size-3" />}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

export function DraftsVisual() {
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Bold className="size-3" />
          <Italic className="size-3" />
          <Link2 className="size-3" />
        </div>
        <div className="flex -space-x-1.5">
          <Avatar who="maya" size={18} ring />
          <Avatar who="jonas" size={18} ring />
        </div>
      </div>
      <div className="space-y-2 p-3 leading-relaxed">
        <p>Hi Hannah,</p>
        <p>
          Thanks for flagging this. We&apos;ve refunded the duplicate charge
          <span className="relative mx-px inline-block h-3.5 w-px translate-y-0.5 bg-[#2563eb]">
            <span className="absolute -top-4 left-0 rounded-[3px] bg-[#2563eb] px-1 text-[9px] leading-3.5 font-medium whitespace-nowrap text-white">
              Jonas
            </span>
          </span>{" "}
          and it should appear within 5 business days.
        </p>
        <p>
          <span className="bg-[#16a34a]/15">Your invoice has been updated</span>
          <span className="relative mx-px inline-block h-3.5 w-px translate-y-0.5 bg-[#16a34a]">
            <span className="absolute -top-4 left-0 rounded-[3px] bg-[#16a34a] px-1 text-[9px] leading-3.5 font-medium whitespace-nowrap text-white">
              Maya
            </span>
          </span>
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">2 editing · saved</span>
        <span className="inline-flex items-center gap-1 rounded-[4px] bg-primary px-2 py-1 text-[10.5px] font-medium text-primary-foreground">
          <Send className="size-3" /> Send
        </span>
      </div>
    </Panel>
  )
}

export function PresenceVisual() {
  return (
    <div className="w-full max-w-[340px] space-y-2 text-[11.5px]">
      <Panel className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">Shipping delay on order #2231</div>
            <div className="mt-1 flex gap-1">
              <Label name="Urgent" color={labelColors.urgent} />
              <Label name="VIP" color={labelColors.vip} />
            </div>
          </div>
          <div className="flex items-center -space-x-1.5">
            <Avatar who="maya" size={22} ring />
            <Avatar who="jonas" size={22} ring />
            <Avatar who="priya" size={22} ring />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-brand" /> Maya, Jonas and Priya are viewing
        </div>
      </Panel>
      <div className="flex items-center gap-2 rounded-[8px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2">
        <Avatar who="jonas" size={20} />
        <span className="flex-1">
          <span className="font-semibold">Jonas</span> is replying to this conversation
        </span>
        <TypingDots className="text-[#b45309]" />
      </div>
      <Panel className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
        <CircleCheck className="size-3.5 text-(--brand-ink)" />
        <span>Seen by Priya · 1m ago</span>
      </Panel>
    </div>
  )
}

export function ChatVisual() {
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 font-semibold">
        <Hash className="size-3.5 text-muted-foreground" /> support-team
        <span className="ml-auto font-mono text-[9.5px] font-normal text-muted-foreground">6 members</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <Avatar who="leo" size={22} />
          <div>
            <div className="text-[10.5px] font-semibold">
              Leo <span className="font-normal text-muted-foreground">10:02</span>
            </div>
            <p>Did anyone see the maintenance notice from our host?</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Avatar who="priya" size={22} />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold">
              Priya <span className="font-normal text-muted-foreground">10:03</span>
            </div>
            <p>Yes, linking it here:</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-[6px] border border-border bg-surface px-2 py-1.5">
              <Mail className="size-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">Scheduled maintenance, Oct 4</div>
                <div className="text-[10px] text-muted-foreground">ops@ · assigned to Leo</div>
              </div>
            </div>
            <div className="mt-1.5 flex gap-1">
              <span className="rounded-full border border-border bg-card px-1.5 text-[10px]">
                <Check className="mr-0.5 inline size-2.5" />2
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-3 py-2 text-muted-foreground">Message #support-team</div>
    </Panel>
  )
}

export function TasksVisual() {
  const tasks = [
    { title: "Send revised quote", done: true, who: "maya" as const },
    { title: "Confirm delivery window", due: "Tomorrow", who: "jonas" as const },
    { title: "Review contract redlines", due: "Fri", who: "priya" as const, link: "Re: MSA v3" },
  ]
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-semibold">Tasks</span>
        <span className="font-mono text-[9.5px] text-muted-foreground">2 open</span>
      </div>
      <ul className="divide-y divide-border">
        {tasks.map((t) => (
          <li key={t.title} className="flex items-center gap-2.5 px-3 py-2.5">
            <span
              className={`flex size-3.5 items-center justify-center rounded-[4px] border ${t.done ? "border-transparent bg-brand text-[#07210f]" : "border-foreground/25"}`}
            >
              {t.done && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={t.done ? "text-muted-foreground line-through" : "font-medium"}>{t.title}</div>
              {t.link && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-[4px] bg-surface px-1.5 text-[10px] text-muted-foreground">
                  <Mail className="size-2.5" /> {t.link}
                </span>
              )}
            </div>
            {t.due && <span className="font-mono text-[9.5px] text-muted-foreground">{t.due}</span>}
            <Avatar who={t.who} size={18} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ContactsVisual() {
  const history = [
    { s: "Invoice #4821 was charged twice", st: "Open", c: "#16a34a" },
    { s: "Adding two seats to our plan", st: "Closed", c: "#a3a3a3" },
    { s: "Onboarding call follow-up", st: "Closed", c: "#a3a3a3" },
  ]
  return (
    <Panel className="w-full max-w-[340px] overflow-hidden text-[11.5px]">
      <div className="flex items-center gap-3 p-3">
        <Contact initials="HL" size={36} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Hannah Lee</div>
          <div className="truncate text-muted-foreground">hannah@northwind.example</div>
        </div>
      </div>
      <div className="grid grid-cols-3 border-y border-border text-center">
        {[
          ["12", "conversations"],
          ["2d", "last contact"],
          ["Maya", "usually helps"],
        ].map(([v, l]) => (
          <div key={l} className="border-r border-border py-2 last:border-r-0">
            <div className="text-[12px] font-semibold">{v}</div>
            <div className="text-[9.5px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <ul className="p-1.5">
        {history.map((h) => (
          <li key={h.s} className="flex items-center gap-2 rounded-[5px] px-1.5 py-1.5">
            <span className="size-1.5 rounded-full" style={{ background: h.c }} />
            <span className="flex-1 truncate">{h.s}</span>
            <span className="font-mono text-[9.5px] text-muted-foreground">{h.st}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
