"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import type { CalendarEntry, CalendarSource, EventFields } from "@/lib/calendar"
import { addDays } from "@/lib/calendar"

export const selectClass = "h-9 min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"

export function CalendarEditor({ entry, day, timeZone, title, conversationId, sources, senders, slug, it, onClose, onManage, submit, remove }: {
  entry?: CalendarEntry
  day: string
  timeZone: string
  title?: string
  conversationId?: string
  sources: CalendarSource[]
  senders: { id: string; email: string }[]
  slug: string
  it: boolean
  onClose: () => void
  onManage: () => void
  submit: (id: string, fields: EventFields, series: boolean, organizerAccountId?: string) => Promise<void>
  remove: (series: boolean) => Promise<void>
}) {
  const [series, setSeries] = useState(!entry?.occurrence)
  const [fields, setFields] = useState<EventFields>(entry ?? {
    title: title ?? "", description: "", location: "", start: day + "T09:00", end: day + "T10:00",
    timeZone, allDay: false, repeat: "", attendees: [], reminder: null,
  })
  const [attendees, setAttendees] = useState(fields.attendees.join(", "))
  const [calendarId, setCalendarId] = useState(entry?.calendarId ?? sources.find((source) => source.writable)?.id ?? "")
  const [sender, setSender] = useState(entry?.organizerAccountId ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const writable = entry?.writable ?? true
  const update = <K extends keyof EventFields>(key: K, value: EventFields[K]) => setFields((prev) => ({ ...prev, [key]: value }))
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try { await operation(); onClose() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const link = entry?.conversationId ?? conversationId
  return <Sheet open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
      <SheetHeader className="border-b">
        <SheetTitle>{entry ? (it ? "Dettaglio evento" : "Event details") : (it ? "Nuovo evento" : "New event")}</SheetTitle>
        <SheetDescription>{it ? "Orari, calendario e dettagli dell’appuntamento." : "Appointment time, calendar and details."}</SheetDescription>
      </SheetHeader>
      <form className="space-y-4 p-4 pb-8" onSubmit={(event) => {
        event.preventDefault()
        void run(() => submit(calendarId, { ...fields, attendees: attendees.split(/[,;\s]+/).filter(Boolean) }, series, sender || undefined))
      }}>
        <fieldset disabled={busy || !writable} className="space-y-4">
          {entry?.occurrence && <label className="grid gap-1 text-sm">{it ? "Modifica" : "Edit scope"}
            <select className={selectClass} value={series ? "series" : "one"} onChange={(event) => {
              const whole = event.target.value === "series"
              const next = whole ? entry.series : entry
              setSeries(whole)
              setFields(next)
              setAttendees(next.attendees.join(", "))
              setConfirmDelete(false)
            }}>
              <option value="one">{it ? "Questo appuntamento" : "This occurrence"}</option>
              <option value="series">{it ? "Intera serie" : "Entire series"}</option>
            </select>
          </label>}
          <label className="grid gap-1 text-sm">{it ? "Titolo" : "Title"}
            <Input required maxLength={300} value={fields.title} onChange={(e) => update("title", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">{it ? "Calendario" : "Calendar"}
            <select required disabled={Boolean(entry)} className={selectClass} value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              <option value="">{it ? "Crea o collega un calendario" : "Create or connect a calendar"}</option>
              {sources.filter((s) => s.writable || s.id === calendarId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fields.allDay} onChange={(e) => {
              const allDay = e.target.checked
              const day = fields.start.slice(0, 10)
              const end = fields.end.slice(0, 10)
              setFields({ ...fields, allDay, start: allDay ? day : day + "T09:00", end: allDay ? (end > day ? end : addDays(day, 1)) : end + "T10:00" })
            }} />
            {it ? "Tutto il giorno" : "All day"}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm">{it ? "Inizio" : "Start"}
              <Input required type={fields.allDay ? "date" : "datetime-local"} value={fields.start} onChange={(e) => update("start", e.target.value)} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">{fields.allDay ? (it ? "Fine (giorno escluso)" : "End (exclusive)") : (it ? "Fine" : "End")}
              <Input required type={fields.allDay ? "date" : "datetime-local"} value={fields.end} onChange={(e) => update("end", e.target.value)} />
            </label>
          </div>
          {!fields.allDay && <label className="grid gap-1 text-sm">{it ? "Fuso orario" : "Time zone"}
            <Input required list="calendar-time-zones" value={fields.timeZone} onChange={(e) => update("timeZone", e.target.value)} />
            <datalist id="calendar-time-zones">{["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => <option key={zone} value={zone} />)}</datalist>
          </label>}
          {series && <label className="grid gap-1 text-sm">{it ? "Ricorrenza" : "Repeat"}
            <select className={selectClass} value={fields.repeat} onChange={(e) => update("repeat", e.target.value)}>
              {Object.entries({ "": it ? "Mai" : "Never", DAILY: it ? "Ogni giorno" : "Daily", WEEKLY: it ? "Ogni settimana" : "Weekly", MONTHLY: it ? "Ogni mese" : "Monthly", YEARLY: it ? "Ogni anno" : "Yearly" }).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
          <label className="grid gap-1 text-sm">{it ? "Luogo o link" : "Location or link"}
            <Input maxLength={1000} value={fields.location} onChange={(e) => update("location", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">{it ? "Descrizione" : "Description"}
            <Textarea maxLength={20000} value={fields.description} onChange={(e) => update("description", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">{it ? "Email invitati" : "Attendee emails"}
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="name@example.com" />
            {entry && (!series || !entry.occurrence) && Object.entries(entry.responses).map(([address, status]) => {
              const label = {
                ACCEPTED: it ? "Accettato" : "Accepted",
                TENTATIVE: it ? "Forse" : "Tentative",
                DECLINED: it ? "Rifiutato" : "Declined",
                "NEEDS-ACTION": it ? "In attesa" : "Awaiting response",
              }[status]
              return label && <span key={address} className="break-all text-xs text-muted-foreground">{address} · {label}</span>
            })}
          </label>
          {attendees.trim() && sources.find((source) => source.id === calendarId)?.kind !== "aruba" &&
            <label className="grid gap-1 text-sm">{it ? "Invia inviti da" : "Send invitations from"}
              <select required disabled={Boolean(entry?.organizerAccountId)} className={selectClass} value={sender} onChange={(e) => setSender(e.target.value)}>
                <option value="">{it ? "Scegli una casella" : "Choose a mailbox"}</option>
                {senders.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
              </select>
            </label>}
          <label className="grid gap-1 text-sm">{it ? "Promemoria (minuti prima)" : "Reminder (minutes before)"}
            <Input type="number" min={0} max={10080} value={fields.reminder ?? ""} onChange={(e) => update("reminder", e.target.value ? Number(e.target.value) : null)} />
          </label>
        </fieldset>
        {link && <Link className="block text-sm underline" href={`/w/${slug}/all/${link}`}>{it ? "Apri conversazione" : "Open conversation"}</Link>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {writable && <div className="flex flex-wrap gap-2">
          {!entry && !sources.some((source) => source.writable) && <Button type="button" variant="outline" onClick={onManage}>
            {it ? "Gestisci calendari" : "Manage calendars"}
          </Button>}
          <Button type="submit" disabled={busy || !calendarId}>{it ? "Salva" : "Save"}</Button>
          {entry && <Button type="button" variant={confirmDelete ? "destructive" : "outline"} disabled={busy} onClick={() => {
            if (confirmDelete) void run(() => remove(series))
            else setConfirmDelete(true)
          }}>{confirmDelete ? (it ? "Conferma eliminazione" : "Confirm deletion") : (it ? "Elimina" : "Delete")}</Button>}
        </div>}
      </form>
    </SheetContent>
  </Sheet>
}
