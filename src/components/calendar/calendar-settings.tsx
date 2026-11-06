"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { CalendarSource } from "@/lib/calendar"
import { selectClass } from "./calendar-editor"

export type CalendarMailbox = { id: string; email: string; personal: string | null }
type Remote = { path: string; name: string }

export function CalendarSettings({ sources, mailboxes, initialMailbox, locked, canShare, it, onClose, mutate }: {
  sources: CalendarSource[]
  mailboxes: CalendarMailbox[]
  initialMailbox?: string
  locked: boolean
  canShare: boolean
  it: boolean
  onClose: () => void
  mutate: <T = unknown>(body: object) => Promise<T>
}) {
  const [name, setName] = useState("")
  const [shared, setShared] = useState(false)
  const [accountId, setAccountId] = useState(initialMailbox ?? "")
  const [password, setPassword] = useState("")
  const [remote, setRemote] = useState<Remote[] | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [publish, setPublish] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [remove, setRemove] = useState("")
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try { await operation() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return <Sheet open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
      <SheetHeader className="border-b">
        <SheetTitle>{it ? "Gestisci calendari" : "Manage calendars"}</SheetTitle>
        <SheetDescription>{it ? "Crea un calendario Dispatch o collega una casella Aruba." : "Create a Dispatch calendar or connect an Aruba mailbox."}</SheetDescription>
      </SheetHeader>
      <div className="space-y-6 p-4 pb-8">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sources.length > 0 && <ul className="divide-y rounded-lg border bg-card">
          {sources.map((source) => <li key={source.id} className="grid gap-2 p-3">
            <strong className="text-sm">{source.name}</strong>
            {source.kind === "aruba" && <p className="text-xs text-muted-foreground">
              Aruba · {source.syncedAt ? new Date(source.syncedAt).toLocaleString(it ? "it-IT" : "en") : (it ? "In attesa di sincronizzazione" : "Waiting to sync")}
            </p>}
            {source.syncError && <p className="text-xs text-destructive">{source.syncError}</p>}
            {source.manageable && <div className="flex flex-wrap gap-2">
              {source.kind === "aruba" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
                await mutate({ action: "sync", calendarId: source.id })
              })}>{it ? "Sincronizza ora" : "Sync now"}</Button>}
              <Button variant={remove === source.id ? "destructive" : "ghost"} size="sm" disabled={busy} onClick={() => {
                if (remove === source.id) void run(async () => {
                  await mutate({ action: "disconnect", calendarId: source.id })
                  setRemove("")
                })
                else setRemove(source.id)
              }}>{remove === source.id ? (it ? "Conferma rimozione" : "Confirm removal") : source.kind === "aruba" ? (it ? "Scollega" : "Disconnect") : (it ? "Elimina calendario" : "Delete calendar")}</Button>
            </div>}
          </li>)}
        </ul>}
        {!locked && <>
          <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={(event) => {
            event.preventDefault()
            void run(async () => { await mutate({ action: "createCalendar", name, shared }); setName("") })
          }}>
            <h2 className="text-sm font-semibold">{it ? "Nuovo calendario Dispatch" : "New Dispatch calendar"}</h2>
            <label className="grid gap-1 text-sm">{it ? "Nome" : "Name"}
              <Input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {canShare && <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              {it ? "Condividi con il workspace" : "Share with workspace"}
            </label>}
            <Button size="sm" disabled={busy}>{it ? "Crea" : "Create"}</Button>
          </form>
          <form className="space-y-3 rounded-lg border bg-card p-4" onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              if (remote) {
                await mutate({ action: "connect", accountId, password, paths, shared: publish })
                setRemote(null)
                setPaths([])
                setPassword("")
              } else {
                const result = await mutate<{ calendars: Remote[] }>({ action: "discover", accountId, password })
                setRemote(result.calendars)
              }
            })
          }}>
            <h2 className="text-sm font-semibold">{it ? "Collega calendario Aruba" : "Connect Aruba calendar"}</h2>
            <p className="text-xs text-muted-foreground">{it
              ? "In Webmail Aruba, abilita i calendari in Calendario → Sincronizza calendario → Lettura e modifica."
              : "In Aruba Webmail, enable calendars under Calendar → Sync calendar → Read and edit."}</p>
            <label className="grid gap-1 text-sm">{it ? "Casella" : "Mailbox"}
              <select required className={selectClass} value={accountId} onChange={(e) => { setAccountId(e.target.value); setRemote(null); setPaths([]); setPassword(""); setPublish(false) }}>
                <option value="">{it ? "Seleziona una casella IMAP" : "Select an IMAP mailbox"}</option>
                {mailboxes.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">{it ? "Password Aruba" : "Aruba password"}
              <Input type="password" required value={password} autoComplete="off" onChange={(e) => { setPassword(e.target.value); setRemote(null); setPaths([]) }} />
            </label>
            {remote && <fieldset className="grid gap-2 text-sm">
              <legend className="mb-1">{it ? "Calendari da collegare" : "Calendars to connect"}</legend>
              {!remote.length && <p className="text-muted-foreground">{it ? "Nessun calendario disponibile." : "No calendars available."}</p>}
              {remote.map((item) => <label key={item.path} className="flex items-center gap-2">
                <input type="checkbox" checked={paths.includes(item.path)} onChange={(e) => setPaths((prev) => e.target.checked ? [...prev, item.path] : prev.filter((path) => path !== item.path))} />
                {item.name}
              </label>)}
              {mailboxes.find((item) => item.id === accountId)?.personal === null && <label className="flex items-center gap-2">
                <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                {it ? "Condividi con chi può accedere alla casella" : "Share with members who can access this mailbox"}
              </label>}
            </fieldset>}
            <Button size="sm" disabled={busy || !accountId || !password || Boolean(remote && !paths.length)}>
              {remote ? (it ? "Collega" : "Connect") : (it ? "Cerca calendari" : "Find calendars")}
            </Button>
          </form>
        </>}
      </div>
    </SheetContent>
  </Sheet>
}
