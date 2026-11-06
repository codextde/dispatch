"use client"

import Link from "next/link"
import { it as italian, enUS } from "date-fns/locale"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2, SquareCheckBig } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { AreaTopBar } from "@/components/tasks/area-top-bar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import { api } from "@/lib/api-client"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { addDays, dateKey, type CalendarEntry, type CalendarSource } from "@/lib/calendar"
import { CalendarEditor, selectClass } from "./calendar-editor"
import { CalendarSettings, type CalendarMailbox } from "./calendar-settings"

const views = ["day", "week", "month", "agenda"] as const
type View = typeof views[number]
type CalendarData = {
  sources: CalendarSource[]
  entries: CalendarEntry[]
  mailboxes: CalendarMailbox[]
  draftTitle: string | null
  senders: { id: string; email: string }[]
  tasks: { id: string; title: string; dueAt: string }[]
}

function safeTimeZone(zone: string | null, fallback: string) {
  if (!zone) return fallback
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return fallback
  }
}

function validDay(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
}

function interval(day: string, view: View) {
  const first = view === "month" ? day.slice(0, 7) + "-01" : day
  const weekDay = new Date(first + "T00:00:00Z").getUTCDay()
  const from = view === "week" || view === "month" ? addDays(first, -((weekDay + 6) % 7)) : first
  const length = { day: 1, week: 7, month: 42, agenda: 14 }[view]
  return { from, to: addDays(from, length), days: Array.from({ length }, (_, index) => addDays(from, index)) }
}

function matches(entry: CalendarEntry, day: string) {
  const start = entry.start.slice(0, 10)
  const end = entry.end.slice(0, 10)
  return start <= day && (end > day || start === day || (end === day && !entry.allDay && entry.end.slice(11) !== "00:00:00"))
}

function minutes(value: string) {
  return Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))
}

function layout(entries: CalendarEntry[], day: string) {
  const positioned = entries.map((entry) => ({
    entry,
    from: entry.start.slice(0, 10) < day ? 0 : minutes(entry.start),
    to: entry.end.slice(0, 10) > day ? 1440 : minutes(entry.end),
    column: 0,
  })).sort((a, b) => a.from - b.from)
  const occupied: number[] = []
  for (const item of positioned) {
    item.to = Math.min(1440, Math.max(item.to, item.from + 25))
    const slot = occupied.findIndex((end) => end <= item.from)
    item.column = slot < 0 ? occupied.length : slot
    occupied[item.column] = item.to
  }
  return { positioned, columns: Math.max(1, occupied.length) }
}

export function CalendarView() {
  const { org, user, locked, can } = useOrg()
  const { locale } = useI18n()
  const it = locale === "it"
  const mobile = useIsMobile()
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tz = safeTimeZone(user.timezone, browserZone)
  const today = dateKey(new Date(), tz)
  const search = useSearchParams()
  const path = usePathname()
  const router = useRouter()
  const qc = useQueryClient()
  const requestedView = search.get("view")
  const view = views.find((item) => item === requestedView) ?? (mobile ? "agenda" : "week")
  const requestedDay = search.get("date")
  const day = validDay(requestedDay) ? requestedDay : today
  const { from, to, days } = interval(day, view)
  const requestedConversation = search.get("conversation")
  const conversation = requestedConversation && /^[0-9a-f-]{36}$/i.test(requestedConversation) ? requestedConversation : undefined
  const base = "/api/w/" + org.slug + "/calendar"
  const queryKey = ["calendar", org.slug]
  const query = useQuery({
    queryKey: [...queryKey, from, to, tz, conversation],
    refetchInterval: 60_000,
    queryFn: () => api.get<CalendarData>(base + "?" + new URLSearchParams({ from, to, tz, ...(conversation ? { conversation } : {}) })),
  })
  const [hidden, setHidden] = useState<string[]>([])
  const [showTasks, setShowTasks] = useState(true)
  const [settings, setSettings] = useState(false)
  const [editor, setEditor] = useState<{ id: string; day: string; entry?: CalendarEntry } | null>(null)
  const [conversationEventId] = useState(() => crypto.randomUUID())
  const [clearedLink, setClearedLink] = useState(false)
  const mailbox = search.get("mailbox") ?? undefined
  const openedEditor = editor ?? (conversation && query.data?.draftTitle != null && !clearedLink && !locked ? { id: "", day } : null)
  const sources = query.data?.sources ?? []
  const entries = (query.data?.entries ?? []).filter((item) => !hidden.includes(item.calendarId))
  const tasks = showTasks ? query.data?.tasks ?? [] : []
  const closeSettings = () => { setSettings(false); if (mailbox) updateUrl({ mailbox: null }) }
  const updateUrl = (values: Record<string, string | null>) => {
    const params = new URLSearchParams(search.toString())
    for (const [key, value] of Object.entries(values)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    router.replace(path + "?" + params.toString(), { scroll: false })
  }
  const move = (direction: number) => {
    if (view === "month") {
      const next = new Date(day.slice(0, 7) + "-01T00:00:00Z")
      next.setUTCMonth(next.getUTCMonth() + direction)
      updateUrl({ date: next.toISOString().slice(0, 10) })
    } else updateUrl({ date: addDays(day, days.length * direction) })
  }
  const mutate = async <T,>(body: object) => {
    try { return await api.post<T>(base, body) } finally { await qc.invalidateQueries({ queryKey }) }
  }

  useEffect(() => {
    const stream = new EventSource("/api/w/" + org.slug + "/events")
    stream.onmessage = (message) => {
      try {
        const { type } = JSON.parse(message.data) as { type: string }
        if (["calendar.updated", "task.updated", "conversation.deleted"].includes(type)) void qc.invalidateQueries({ queryKey: ["calendar", org.slug] })
      } catch {
        return
      }
    }
    stream.addEventListener("logout", () => stream.close())
    return () => stream.close()
  }, [org.slug, qc])

  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })
    .format(new Date(value + "T00:00:00Z"))
  const openNew = (date: string) => {
    if (sources.some((source) => source.writable)) setEditor({ id: crypto.randomUUID(), day: date })
    else setSettings(true)
  }
  const entryButton = (entry: CalendarEntry, compact = false) => <button
    type="button"
    className="block h-full w-full overflow-hidden rounded-md bg-brand-soft px-2 py-1 text-left text-xs leading-tight text-foreground outline-none hover:ring-1 hover:ring-brand focus-visible:ring-2 focus-visible:ring-ring"
    onClick={() => setEditor({ id: entry.id, day, entry })}
  >
    {!entry.allDay && <span className="mr-1 font-mono text-[10px]">{entry.start.slice(11, 16)}</span>}
    <span className={cn("font-medium", compact && "inline")}>{entry.title || (it ? "Senza titolo" : "Untitled")}</span>
  </button>
  const taskLinks = (date: string) => tasks.filter((item) => dateKey(new Date(item.dueAt), tz) === date).map((task) => <Link
    key={task.id}
    className="flex min-w-0 items-center gap-1 truncate rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    href={`/w/${org.slug}/tasks?task=${task.id}`}
  ><SquareCheckBig className="size-3 shrink-0" /><span className="truncate">{task.title}</span></Link>)
  const grid = view === "week" || view === "day"
  const scroll = useRef<HTMLDivElement>(null)
  const showGrid = grid && Boolean(sources.length)
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = showGrid ? 7 * 48 : 0
  }, [showGrid, view])
  const zoneLabel = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(day + "T12:00:00Z")).find((part) => part.type === "timeZoneName")?.value ?? tz
  return <div className="flex h-full flex-col">
    <AreaTopBar />
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-3 border-b bg-background px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{it ? "Calendario" : "Calendar"}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="icon-sm" aria-label={it ? "Gestisci calendari" : "Manage calendars"} onClick={() => setSettings(true)}><Settings2 /></Button>
            {!locked && <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/85" onClick={() => openNew(day)}><Plus />{it ? "Nuovo evento" : "New event"}</Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => updateUrl({ date: today })}>{it ? "Oggi" : "Today"}</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => move(-1)} aria-label={it ? "Precedente" : "Previous"}><ChevronLeft /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => move(1)} aria-label={it ? "Successivo" : "Next"}><ChevronRight /></Button>
          <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="capitalize"><CalendarDays />{format(day, { month: "long", year: "numeric" })}</Button></PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar locale={it ? italian : enUS} mode="single" selected={new Date(day + "T12:00:00")} onSelect={(date) => {
              if (date) updateUrl({ date: dateKey(date, Intl.DateTimeFormat().resolvedOptions().timeZone) })
            }} /></PopoverContent>
          </Popover>
          <select className={selectClass} aria-label={it ? "Vista" : "View"} value={view} onChange={(e) => updateUrl({ view: e.target.value })}>
            {views.map((item, index) => <option key={item} value={item}>{(it ? ["Giorno", "Settimana", "Mese", "Agenda"] : ["Day", "Week", "Month", "Agenda"])[index]}</option>)}
          </select>
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm">{it ? "Filtri" : "Filters"}</Button></PopoverTrigger>
            <PopoverContent align="end" className="grid gap-2 text-sm">
              {sources.map((source) => <label key={source.id} className="flex items-center gap-2">
                <input type="checkbox" checked={!hidden.includes(source.id)} onChange={(e) => setHidden((prev) => e.target.checked ? prev.filter((id) => id !== source.id) : [...prev, source.id])} />
                {source.name}
              </label>)}
              <label className="flex items-center gap-2"><input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />{it ? "Scadenze attività" : "Task deadlines"}</label>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div ref={scroll} className="min-h-0 flex-1 overflow-auto bg-surface/30 pb-[env(safe-area-inset-bottom)]">
        {query.isPending ? <p role="status" className="p-5 text-sm text-muted-foreground">{it ? "Caricamento…" : "Loading…"}</p>
          : query.isError ? <div className="space-y-2 p-5 text-sm"><p role="alert">{query.error.message}</p><Button variant="outline" onClick={() => void query.refetch()}>{it ? "Riprova" : "Retry"}</Button></div>
          : !sources.length && !tasks.length ? <section className="mx-auto mt-10 grid max-w-sm justify-items-center gap-3 p-4 text-center">
            <CalendarDays className="size-7 text-muted-foreground" />
            <h2 className="font-semibold">{it ? "Nessun calendario" : "No calendars yet"}</h2>
            <p className="text-sm text-muted-foreground">{it ? "Crea un calendario personale o collega gli appuntamenti della tua Webmail Aruba." : "Create a personal calendar or connect your Aruba Webmail appointments."}</p>
            {!locked && <Button variant="outline" onClick={() => setSettings(true)}>{it ? "Gestisci calendari" : "Manage calendars"}</Button>}
          </section> : grid ? <div className={cn("grid", view === "week" && "min-w-[650px]")} style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div title={tz} className="sticky top-0 z-10 grid place-items-center border-b bg-background text-[10px] text-muted-foreground">{zoneLabel}</div>
            {days.map((date) => <div key={date} className={cn("sticky top-0 z-10 border-b border-l bg-background p-2 text-center text-sm", date === today && "font-semibold text-brand")}>
              {format(date, { weekday: "short", day: "numeric" })}
            </div>)}
            <div className="sticky top-[37px] z-10 border-b bg-background p-1 text-[10px] leading-tight text-muted-foreground">{it ? "Tutto il giorno" : "All day"}</div>
            {days.map((date) => <div key={date} className="sticky top-[37px] z-10 grid content-start gap-1 border-b border-l bg-background p-1">
              {entries.filter((item) => item.allDay && matches(item, date)).map((item) => <div key={item.id + item.occurrence}>{entryButton(item, true)}</div>)}
              {taskLinks(date)}
            </div>)}
            <div className="text-right font-mono text-[10px] text-muted-foreground">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 pr-2">{String(hour).padStart(2, "0")}:00</div>)}</div>
            {days.map((date) => {
              const { positioned, columns } = layout(entries.filter((item) => !item.allDay && matches(item, date)), date)
              return <div key={date} className={cn("relative border-l", date === today && "bg-brand-soft/30")}>
                {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 border-b" />)}
                {positioned.map(({ entry, from, to, column }) => <div key={entry.id + entry.occurrence} className="absolute px-px py-px" style={{ top: from * 0.8, height: (to - from) * 0.8, left: `${column / columns * 100}%`, width: `${100 / columns}%` }}>{entryButton(entry)}</div>)}
              </div>
            })}
          </div> : view === "month" ? <div className="grid grid-cols-7">
            {days.slice(0, 7).map((date) => <div key={date} className="border-b p-2 text-center text-xs text-muted-foreground">{format(date, { weekday: "short" })}</div>)}
            {days.map((date) => {
              const items = entries.filter((item) => matches(item, date))
              return <div key={date} className={cn("min-h-24 min-w-0 space-y-1 border-r border-b p-1 sm:p-2", date.slice(0, 7) !== day.slice(0, 7) && "bg-muted/45")}>
                <button className={cn("rounded px-1 text-xs hover:bg-muted", date === today && "bg-brand-soft font-semibold")} onClick={() => updateUrl({ date, view: "day" })}>{Number(date.slice(8))}</button>
                {items.slice(0, 3).map((item) => <div key={item.id + item.occurrence}>{entryButton(item, true)}</div>)}
                {items.length > 3 && <button className="text-xs underline" onClick={() => updateUrl({ date, view: "day" })}>+{items.length - 3}</button>}
                {taskLinks(date)}
              </div>
            })}
          </div> : <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-5">
            {days.map((date) => {
              const items = entries.filter((item) => matches(item, date))
              const deadlines = taskLinks(date)
              return <section key={date} className="space-y-1 rounded-lg border bg-card p-3">
                <h2 className={cn("text-sm font-semibold capitalize", date === today && "text-brand")}>{format(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
                {items.map((item) => <div key={item.id + item.occurrence}>{entryButton(item)}</div>)}
                {deadlines}
                {!items.length && !deadlines.length && <p className="text-xs text-muted-foreground">{it ? "Nessun appuntamento" : "No appointments"}</p>}
              </section>
            })}
          </div>}
      </div>
    </main>
    {(settings || mailbox) && <CalendarSettings sources={sources} mailboxes={query.data?.mailboxes ?? []} initialMailbox={mailbox}
      locked={Boolean(locked)} canShare={can("calendar.manage")} it={it} onClose={closeSettings} mutate={mutate} />}
    {openedEditor && !query.isPending && !settings && <CalendarEditor key={openedEditor.id || conversation} entry={openedEditor.entry}
      day={openedEditor.day} timeZone={tz} title={query.data?.draftTitle ?? undefined} conversationId={conversation}
      sources={sources} senders={query.data?.senders ?? []} slug={org.slug} it={it} onManage={() => setSettings(true)} onClose={() => {
        setEditor(null)
        if (conversation) { setClearedLink(true); updateUrl({ conversation: null }) }
      }}
      submit={async (calendarId, fields, series, organizerAccountId) => {
        const item = openedEditor.entry
        await mutate({ action: "save", calendarId, id: openedEditor.id || conversationEventId, fields, organizerAccountId: sources.find((source) => source.id === calendarId)?.kind === "aruba" ? undefined : organizerAccountId,
          version: item?.version, occurrence: series ? undefined : item?.occurrence ?? undefined, conversationId: item ? undefined : conversation })
      }}
      remove={async (series) => {
        const item = openedEditor.entry!
        await mutate({ action: "delete", calendarId: item.calendarId, id: item.id, version: item.version, occurrence: series ? undefined : item.occurrence ?? undefined })
      }} />}
  </div>
}
