"use client"

import { useMemo, useState } from "react"
import { Globe, Loader2, Trash2, User, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useOrg } from "@/components/app/org-provider"
import { Combobox } from "@/components/settings/combobox"
import { ConfirmDialog } from "@/components/settings/confirm-dialog"
import {
  fillSampleVariables,
  RESPONSE_VARIABLES,
  RichTextEditor,
  RichTextPreview,
} from "@/components/settings/rich-text-editor"
import { FormField, MicroLabel } from "@/components/settings/settings-ui"
import { useServerAction } from "@/components/settings/use-server-action"
import { createResponse, deleteResponse, updateResponse } from "@/server/workspace/actions/responses"
import { cn } from "@/lib/utils"
import { isBlankHtml, normalizeShortcutInput, SHORTCUT_PATTERN } from "./text"
import { useI18n } from "@/lib/i18n"

export type ResponseScope = "personal" | "team" | "workspace"

export type ResponseDraft = {
  id?: string
  name: string
  subject: string
  shortcut: string
  body: string
  scope: ResponseScope
  teamId: string | null
}

export type TeamOption = { id: string; name: string; color: string }

const SCOPES: { value: ResponseScope; label: string; italian: string; description: string; italianDescription: string; Icon: typeof Globe }[] = [
  { value: "personal", label: "Personal", italian: "Personale", description: "Only you", italianDescription: "Solo tu", Icon: User },
  { value: "team", label: "Team", italian: "Team", description: "Members of one team", italianDescription: "I membri di un team", Icon: UsersRound },
  { value: "workspace", label: "Workspace", italian: "Workspace", description: "Everyone", italianDescription: "Tutti", Icon: Globe },
]

function validate(d: ResponseDraft, it: boolean) {
  const errors: Record<string, string> = {}
  if (!d.name.trim()) errors.name = it ? "Inserisci un nome" : "Name is required"
  const sc = normalizeShortcutInput(d.shortcut)
  if (sc && !SHORTCUT_PATTERN.test(sc)) errors.shortcut = it ? "Usa lettere, numeri, - e _ (massimo 32 caratteri)" : "Use letters, numbers, - and _ (up to 32 characters)"
  if (d.scope === "team" && !d.teamId) errors.teamId = it ? "Scegli un team" : "Choose a team"
  if (isBlankHtml(d.body)) errors.body = it ? "Scrivi il testo della risposta" : "Write the response text"
  return errors
}

export function ResponseEditor({
  slug,
  draft: initialDraft,
  teams,
  canManageShared,
  onClose,
}: {
  slug: string
  draft: ResponseDraft
  teams: TeamOption[]
  canManageShared: boolean
  onClose: () => void
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const { user, org } = useOrg()
  const [draft, setDraft] = useState<ResponseDraft>(initialDraft)
  const [showErrors, setShowErrors] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const { pending, run, fieldErrors } = useServerAction()
  const isNew = !draft.id
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const set = <K extends keyof ResponseDraft>(k: K, v: ResponseDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const clientErrors = validate(draft, it)
  const errors = { ...(showErrors ? clientErrors : {}), ...fieldErrors }

  const samples = useMemo(() => {
    const name = user.name || user.email.split("@")[0]!
    return {
      "contact.first_name": "Jane",
      "contact.name": "Jane Cooper",
      "contact.email": "jane@acme.com",
      "user.name": name,
      "user.first_name": name.split(/\s+/)[0]!,
      "org.name": org.name,
    }
  }, [user, org.name])

  const requestClose = () => {
    if (pending) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = () => {
    setShowErrors(true)
    if (Object.keys(clientErrors).length) return
    const payload = {
      slug,
      name: draft.name.trim(),
      subject: draft.subject.trim() || null,
      shortcut: normalizeShortcutInput(draft.shortcut) || null,
      body: draft.body,
      scope: draft.scope,
      teamId: draft.scope === "team" ? draft.teamId : null,
    }
    void run(() => (draft.id ? updateResponse({ ...payload, id: draft.id }) : createResponse(payload)), {
      success: isNew ? (it ? "Risposta creata" : "Response created") : (it ? "Risposta salvata" : "Response saved"),
      onSuccess: onClose,
    })
  }

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: t.name,
    icon: <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />,
  }))

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && requestClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault()
          }}
        >
          <SheetHeader className="border-b px-5 py-4 pr-12">
            <SheetTitle>{isNew ? (it ? "Nuova risposta predefinita" : "New canned response") : (it ? "Modifica risposta predefinita" : "Edit canned response")}</SheetTitle>
            <SheetDescription>{it ? "Inseriscila dal compositore oppure digita la relativa scorciatoia." : "Insert it from the composer, or type its shortcut."}</SheetDescription>
          </SheetHeader>

          <form
            id="response-form"
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <FormField label={it ? "Nome" : "Name"} htmlFor="response-name" error={errors.name}>
                <Input
                  id="response-name"
                  autoFocus={isNew}
                  value={draft.name}
                  maxLength={80}
                  placeholder={it ? "es. Conferma del rimborso" : "e.g. Refund confirmation"}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(e) => set("name", e.target.value)}
                />
              </FormField>
              <FormField label={it ? "Scorciatoia" : "Shortcut"} htmlFor="response-shortcut" optional error={errors.shortcut}>
                <InputGroup>
                  <InputGroupAddon>/</InputGroupAddon>
                  <InputGroupInput
                    id="response-shortcut"
                    value={draft.shortcut}
                    maxLength={33}
                    placeholder="refund"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="font-mono"
                    aria-invalid={Boolean(errors.shortcut)}
                    onChange={(e) => set("shortcut", e.target.value.replace(/\s/g, "-"))}
                  />
                </InputGroup>
              </FormField>
            </div>

            <FormField
              label={it ? "Oggetto" : "Subject"}
              htmlFor="response-subject"
              optional
              description={it ? "Verrà usato come oggetto quando la risposta viene inserita in un nuovo messaggio." : "Used as the subject when inserted into a new message."}
              error={errors.subject}
            >
              <Input
                id="response-subject"
                value={draft.subject}
                maxLength={200}
              placeholder={it ? "es. Il tuo rimborso è in arrivo" : "e.g. Your refund is on its way"}
                onChange={(e) => set("subject", e.target.value)}
              />
            </FormField>

            <FormField
              label={it ? "Disponibile per" : "Available to"}
              description={!canManageShared ? (it ? "Solo i membri con l’autorizzazione “Gestisci risposte condivise” possono condividerle." : "Only members with “Manage shared responses” can share responses.") : undefined}
              error={errors.teamId}
            >
              <div className="flex flex-col gap-2">
                <div role="radiogroup" aria-label={it ? "Disponibile per" : "Available to"} className="grid grid-cols-3 gap-2">
                  {SCOPES.map(({ value, label, italian, description, italianDescription, Icon }) => {
                    const active = draft.scope === value
                    const disabled = value !== "personal" && !canManageShared
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => set("scope", value)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                          active ? "border-foreground/30 bg-surface ring-1 ring-foreground/10" : "hover:bg-muted/50"
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-[13px] font-medium">
                          <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground")} />
                          {it ? italian : label}
                        </span>
                        <span className="text-xs text-muted-foreground">{it ? italianDescription : description}</span>
                      </button>
                    )
                  })}
                </div>
                {draft.scope === "team" && (
                  <Combobox
                    options={teamOptions}
                    value={draft.teamId}
                    onChange={(v) => set("teamId", v)}
                    placeholder={teams.length ? (it ? "Scegli un team…" : "Choose a team…") : (it ? "Nessun team" : "No teams yet")}
                    disabled={!teams.length}
                    aria-invalid={Boolean(errors.teamId)}
                    searchPlaceholder={it ? "Cerca team…" : "Search teams…"}
                  />
                )}
              </div>
            </FormField>

            <FormField label={it ? "Messaggio" : "Message"} error={errors.body}>
              <RichTextEditor
                value={draft.body}
                onChange={(html) => set("body", html)}
              placeholder={it ? "Ciao {{contact.first_name}}, grazie per averci contattato…" : "Hi {{contact.first_name}}, thanks for reaching out…"}
                variables={RESPONSE_VARIABLES}
                aria-invalid={Boolean(errors.body)}
                minHeight={180}
              />
            </FormField>

            <div className="flex flex-col gap-2">
              <MicroLabel>{it ? "Anteprima" : "Preview"}</MicroLabel>
              <div className="rounded-lg border bg-surface/50 p-4">
                {draft.subject.trim() && (
                  <div className="mb-3 border-b pb-3 text-[13px]">
                    <span className="text-muted-foreground">{it ? "Oggetto: " : "Subject: "}</span>
                    <RichTextPreview
                      className="inline font-medium [&_p]:inline"
                      html={fillSampleVariables(escapeText(draft.subject), samples)}
                    />
                  </div>
                )}
                {isBlankHtml(draft.body) ? (
                  <p className="text-sm text-muted-foreground">{it ? "L’anteprima del messaggio apparirà qui." : "Your message preview appears here."}</p>
                ) : (
                  <RichTextPreview html={fillSampleVariables(draft.body, samples)} />
                )}
                <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                  {it ? "Valori di esempio: contatto “Jane Cooper”, mittente" : "Sample values: contact “Jane Cooper”, sender"} {samples["user.name"]}.
                </p>
              </div>
            </div>
          </form>

          <div className="flex items-center justify-between gap-2 border-t bg-surface/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div>
              {!isNew && (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}>
                      <Trash2 /> <span className="hidden sm:inline">{it ? "Elimina" : "Delete"}</span>
                    </Button>
                  }
                  title={`Delete “${initialDraft.name}”?`}
                  description={it ? "I colleghi non potranno più inserirla. Questa azione non si può annullare." : "Teammates won't be able to insert it anymore. This can't be undone."}
                  confirmLabel={it ? "Elimina risposta" : "Delete response"}
                  destructive
                  onConfirm={async () => {
                    const res = await run(() => deleteResponse({ slug, id: draft.id! }), { success: it ? "Risposta eliminata" : "Response deleted" })
                    if (res.ok) onClose()
                    return res.ok
                  }}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
              {it ? "Annulla" : "Cancel"}
              </Button>
              <Button type="submit" form="response-form" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {isNew ? (it ? "Crea risposta" : "Create response") : (it ? "Salva modifiche" : "Save changes")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={it ? "Annullare le modifiche non salvate?" : "Discard unsaved changes?"}
        description={it ? "Le modifiche a questa risposta andranno perse." : "Your edits to this response will be lost."}
        confirmLabel={it ? "Annulla modifiche" : "Discard"}
        cancelLabel={it ? "Continua a modificare" : "Keep editing"}
        destructive
        onConfirm={() => {
          onClose()
        }}
      />
    </>
  )
}

function escapeText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
