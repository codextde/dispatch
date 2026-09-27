"use client"

import { useMemo, useRef, useState } from "react"
import { FileUp, Lock, Upload } from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/components/app/org-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiClientError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { FIELD_LABELS, guessMapping, parseCsv, rowsToContacts, type ContactField } from "./csv"
import { useContactMutations, type ContactDto } from "./use-contacts"

/* ------------------------------ Create contact ----------------------------- */

export function NewContactDialog({
  slug,
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: { email?: string; name?: string | null }
  onCreated?: (contact: ContactDto) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <NewContactForm slug={slug} initial={initial} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NewContactForm({
  slug,
  initial,
  onCreated,
  onClose,
}: {
  slug: string
  initial?: { email?: string; name?: string | null }
  onCreated?: (contact: ContactDto) => void
  onClose: () => void
}) {
  const { can } = useOrg()
  const canShare = can("contacts.manage")
  const { create } = useContactMutations(slug)
  const [form, setForm] = useState({
    email: initial?.email ?? "",
    name: initial?.name ?? "",
    company: "",
    title: "",
    phone: "",
    notes: "",
  })
  const [isPrivate, setIsPrivate] = useState(!canShare)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const contact = await create.mutateAsync({
        email: form.email,
        name: form.name || null,
        company: form.company || null,
        title: form.title || null,
        phone: form.phone || null,
        notes: form.notes || null,
        isPrivate,
      })
      toast.success("Contact added")
      onCreated?.(contact)
      onClose()
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Couldn’t save the contact")
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New contact</DialogTitle>
        <DialogDescription>Add someone to the {isPrivate ? "your private" : "shared"} address book.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nc-email">Email</Label>
          <Input id="nc-email" type="email" required autoFocus value={form.email} onChange={set("email")} placeholder="jane@company.com" aria-invalid={Boolean(error)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nc-name">Name</Label>
          <Input id="nc-name" value={form.name} onChange={set("name")} placeholder="Jane Doe" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nc-company">Company</Label>
            <Input id="nc-company" value={form.company} onChange={set("company")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nc-title">Job title</Label>
            <Input id="nc-title" value={form.title} onChange={set("title")} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nc-phone">Phone</Label>
          <Input id="nc-phone" type="tel" value={form.phone} onChange={set("phone")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nc-notes">Notes</Label>
          <Textarea id="nc-notes" value={form.notes} onChange={set("notes")} rows={2} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span className="flex flex-col">
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              <Lock className="size-3.5" /> Private contact
            </span>
            <span className="text-xs text-muted-foreground">
              {canShare ? "Only you can see it." : "You can add private contacts. Shared contacts are managed by admins."}
            </span>
          </span>
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} disabled={!canShare} aria-label="Private contact" />
        </label>
        {error && (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || !form.email.trim()}>
          {create.isPending && <Spinner />}
          Add contact
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ---------------------------------- Import --------------------------------- */

const FIELD_OPTIONS: (ContactField | "skip")[] = ["skip", "email", "name", "firstName", "lastName", "company", "title", "phone", "notes", "tags"]

export function ImportContactsDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">{open && <ImportFlow slug={slug} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function ImportFlow({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { can } = useOrg()
  const canShare = can("contacts.manage")
  const { importContacts } = useContactMutations(slug)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<(ContactField | null)[]>([])
  const [isPrivate, setIsPrivate] = useState(!canShare)
  const [mode, setMode] = useState<"skip" | "update">("skip")
  const [extraAsCustom, setExtraAsCustom] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contacts = useMemo(
    () => (headers.length ? rowsToContacts(headers, rows, mapping, { customFields: extraAsCustom }) : []),
    [headers, rows, mapping, extraAsCustom]
  )

  const load = async (file: File) => {
    setError(null)
    if (file.size > 10 * 1024 * 1024) return setError("That file is larger than 10 MB.")
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) return setError("The file needs a header row and at least one contact.")
    const [head, ...body] = parsed
    if (body.length > 5000) return setError("You can import up to 5,000 contacts at a time. Split the file and try again.")
    const guessed = guessMapping(head!)
    setFileName(file.name)
    setHeaders(head!)
    setRows(body)
    setMapping(guessed)
    if (!guessed.includes("email")) setError("We couldn’t find an email column. Pick it below.")
  }

  const submit = async () => {
    setError(null)
    try {
      const r = await importContacts.mutateAsync({ contacts, isPrivate, mode })
      const parts = [`${r.created} added`]
      if (r.updated) parts.push(`${r.updated} updated`)
      if (r.skipped) parts.push(`${r.skipped} skipped`)
      if (r.invalid) parts.push(`${r.invalid} invalid`)
      toast.success("Import finished", { description: parts.join(" · ") })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Import contacts</DialogTitle>
        <DialogDescription>Upload a CSV exported from Google Contacts, Outlook, HubSpot or a spreadsheet.</DialogDescription>
      </DialogHeader>

      {!headers.length ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) void load(f)
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
            dragging && "border-brand bg-brand-soft/40"
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <FileUp className="size-5 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium">Drop a CSV file here or click to browse</span>
          <span className="text-xs text-muted-foreground">Needs a header row and an email column · up to 5,000 contacts</span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate">
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground"> · {rows.length} rows · {contacts.length} with an email</span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setHeaders([])
                setRows([])
                setFileName(null)
                setError(null)
              }}
            >
              Choose another file
            </Button>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="min-w-36 border-b px-2 py-2 align-top font-normal">
                      <div className="mb-1.5 truncate font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase" title={h}>
                        {h || `Column ${i + 1}`}
                      </div>
                      <Select
                        value={mapping[i] ?? "skip"}
                        onValueChange={(v) =>
                          setMapping((m) => m.map((x, j) => (j === i ? (v === "skip" ? null : (v as ContactField)) : x === v ? null : x)))
                        }
                      >
                        <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label={`Map column ${h}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((f) => (
                            <SelectItem key={f} value={f} className="text-xs">
                              {f === "skip" ? (extraAsCustom ? "Custom field" : "Don’t import") : FIELD_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, ri) => (
                  <tr key={ri} className="border-b last:border-0">
                    {headers.map((_, ci) => (
                      <td key={ci} className={cn("max-w-48 truncate px-2 py-1.5", mapping[ci] === null && !extraAsCustom && "text-muted-foreground/50")}>
                        {r[ci]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-[13px]">Import unmapped columns as custom fields</span>
              <Switch checked={extraAsCustom} onCheckedChange={setExtraAsCustom} aria-label="Import unmapped columns as custom fields" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-[13px]">Update contacts that already exist</span>
              <Switch checked={mode === "update"} onCheckedChange={(v) => setMode(v ? "update" : "skip")} aria-label="Update existing contacts" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 sm:col-span-2">
              <span className="flex flex-col">
                <span className="text-[13px]">Import as private contacts</span>
                {!canShare && <span className="text-xs text-muted-foreground">Only admins can import into the shared address book.</span>}
              </span>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} disabled={!canShare} aria-label="Import as private contacts" />
            </label>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void load(f)
          e.target.value = ""
        }}
      />
      {error && (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!contacts.length || importContacts.isPending}>
          {importContacts.isPending ? <Spinner /> : <Upload />}
          Import {contacts.length ? contacts.length.toLocaleString() : ""} contacts
        </Button>
      </DialogFooter>
    </div>
  )
}
