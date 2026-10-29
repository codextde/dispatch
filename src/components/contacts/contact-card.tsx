"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { it as dateFnsIt } from "date-fns/locale"
import { ArrowUpRight, Check, Copy, Lock, Pencil, Phone, SquarePen, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/components/app/org-provider"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { composeHref, ConversationLink } from "./contact-detail"
import { EmailListInput, InlineField, TagInput } from "./contact-fields"
import { displayName, useContactLookup, useContactMutations, type ContactInput } from "./use-contacts"

/**
 * Compact contact card for the conversation sidebar. Shows what the team
 * knows about a participant (company, notes, history) and lets members edit
 * it inline or add an unknown sender to the address book.
 */
export function ContactCard({
  slug,
  email,
  name,
  excludeConversationId,
  className,
}: {
  slug: string
  email: string
  name?: string | null
  /** Hide this conversation from "Recent conversations" (usually the one being viewed) */
  excludeConversationId?: string
  className?: string
}) {
  const { locale } = useI18n()
  const tx = (en: string, it: string) => locale === "it" ? it : en
  const { can } = useOrg()
  const { data, isPending, isError } = useContactLookup(slug, email)
  const { create, update } = useContactMutations(slug)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  if (isPending) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy aria-label={tx("Loading contact", "Caricamento contatto")}>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    )
  }
  if (isError || !data) return null

  const contact = data.contact
  const label = contact ? displayName(contact) : name?.trim() || email
  const subtitle = contact ? [contact.title, contact.company].filter(Boolean).join(" · ") : ""
  const recent = data.conversations.filter((c) => c.id !== excludeConversationId).slice(0, 3)
  const otherCount = data.conversationTotal - (data.conversations.some((c) => c.id === excludeConversationId) ? 1 : 0)
  const patch = (p: ContactInput) => contact && update.mutate({ id: contact.id, patch: p })
  // The card may have been opened for an alternate address: show the contact's other addresses
  const otherAddresses = contact ? [contact.email, ...contact.alternateEmails].filter((a) => a.toLowerCase() !== email.toLowerCase()) : []

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(tx("Couldn’t copy to the clipboard", "Impossibile copiare negli appunti"))
    }
  }

  const addContact = () =>
    create.mutate(
      { email, name: name?.trim() || null, isPrivate: !can("contacts.manage") },
      {
        onSuccess: () => {
          toast.success(tx("Added to contacts", "Contatto aggiunto"))
          setEditing(true)
        },
        onError: (err) => toast.error(err.message),
      }
    )

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label={`${tx("Contact", "Contatto")}: ${label}`}>
      <div className="flex items-start gap-3">
        <UserAvatar name={contact?.name ?? name} email={email} src={contact?.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[14px] font-semibold tracking-tight" title={label}>
              {label}
            </h3>
            {contact?.isPrivate && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={tx("Private contact", "Contatto privato")} />}
          </div>
          {subtitle ? (
            <p className="truncate text-[12.5px] text-muted-foreground" title={subtitle}>
              {subtitle}
            </p>
          ) : (
            <p className="truncate text-[12.5px] text-muted-foreground">{contact ? tx("No company yet", "Nessuna azienda") : tx("Not in your contacts", "Non presente nei contatti")}</p>
          )}
        </div>
        {contact && (
          <div className="-mr-1 flex shrink-0 items-center">
            {contact.canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={() => setEditing((e) => !e)} aria-pressed={editing} aria-label={tx("Edit contact", "Modifica contatto")}>
                    {editing ? <Check /> : <Pencil />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{editing ? tx("Done", "Fine") : tx("Edit contact", "Modifica contatto")}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-xs" aria-label={tx("Open in contacts", "Apri nei contatti")}>
                  <Link href={`/w/${slug}/contacts?c=${contact.id}`}>
                    <ArrowUpRight />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tx("Open in contacts", "Apri nei contatti")}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {editing && contact ? (
        <div className="flex flex-col gap-0.5 rounded-lg border bg-surface/50 p-1.5">
          <InlineField label={tx("Name", "Nome")} value={contact.name} placeholder={tx("Add name", "Aggiungi nome")} onCommit={(v) => patch({ name: v || null })} />
          <InlineField label={tx("Company", "Azienda")} value={contact.company} placeholder={tx("Add company", "Aggiungi azienda")} onCommit={(v) => patch({ company: v || null })} />
          <InlineField label={tx("Title", "Ruolo")} value={contact.title} placeholder={tx("Add job title", "Aggiungi ruolo")} onCommit={(v) => patch({ title: v || null })} />
          <InlineField label={tx("Phone", "Telefono")} type="tel" value={contact.phone} placeholder={tx("Add phone", "Aggiungi telefono")} onCommit={(v) => patch({ phone: v || null })} />
          <div className="grid grid-cols-[88px_1fr] items-start gap-2">
            <span className="flex min-h-8 items-center text-[12.5px] text-muted-foreground">{tx("Other emails", "Altre email")}</span>
            <EmailListInput value={contact.alternateEmails} onChange={(alternateEmails) => patch({ alternateEmails })} placeholder={tx("Add email", "Aggiungi email")} />
          </div>
          <div className="grid grid-cols-[88px_1fr] items-start gap-2">
            <span className="flex min-h-8 items-center text-[12.5px] text-muted-foreground">{tx("Tags", "Etichette")}</span>
            <TagInput value={contact.tags} onChange={(tags) => patch({ tags })} />
          </div>
          <InlineField label={tx("Notes", "Note")} multiline value={contact.notes} placeholder={tx("Add notes for your team…", "Aggiungi note per il team…")} onCommit={(v) => patch({ notes: v || null })} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="group/email flex min-w-0 items-center gap-1.5">
            <a href={`mailto:${email}`} className="truncate text-foreground/90 underline-offset-2 hover:underline" title={email}>
              {email}
            </a>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 outline-none group-hover/email:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={tx("Copy email address", "Copia indirizzo email")}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
          {otherAddresses.length > 0 && (
            <p className="flex min-w-0 flex-wrap gap-x-1.5 text-[12px] text-muted-foreground">
              <span>{tx("Also", "Anche")}</span>
              {otherAddresses.map((a, i) => (
                <a key={a} href={`mailto:${a}`} className="max-w-full truncate hover:text-foreground hover:underline" title={a}>
                  {a}
                  {i < otherAddresses.length - 1 ? "," : ""}
                </a>
              ))}
            </p>
          )}
          {contact?.phone && (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <Phone className="size-3.5" />
              {contact.phone}
            </a>
          )}
          {contact && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {contact.tags.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
          {contact?.notes && (
            <button
              type="button"
              disabled={!contact.canEdit}
              onClick={() => setEditing(true)}
              className="mt-1 rounded-md border-l-2 border-amber-400/70 bg-amber-500/5 px-2.5 py-1.5 text-left text-[12.5px] leading-relaxed whitespace-pre-line text-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              title={contact.canEdit ? tx("Edit notes", "Modifica note") : undefined}
            >
              <span className="line-clamp-4">{contact.notes}</span>
            </button>
          )}
        </div>
      )}

      {!contact && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="flex-1" onClick={addContact} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <UserPlus />}
            {tx("Add to contacts", "Aggiungi ai contatti")}
          </Button>
          <Button asChild size="sm" variant="ghost" aria-label={`${tx("New email to", "Nuova email a")} ${email}`}>
            <Link href={composeHref(slug, email)}>
              <SquarePen />
            </Link>
          </Button>
        </div>
      )}

      {(data.conversationTotal > 0 || contact?.lastContactedAt) && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            {otherCount > 0 ? (locale === "it" ? `${otherCount} ${otherCount === 1 ? "altra conversazione" : "altre conversazioni"}` : `${otherCount} other conversation${otherCount === 1 ? "" : "s"}`) : tx("No other conversations", "Nessun’altra conversazione")}
            {contact?.lastContactedAt && <> · {tx("last", "ultimo contatto")} {formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true, ...(locale === "it" ? { locale: dateFnsIt } : {}) })}</>}
          </p>
          {recent.length > 0 && (
            <div className="flex flex-col">
              {recent.map((c) => (
                <ConversationLink key={c.id} slug={slug} c={c} compact />
              ))}
            </div>
          )}
          {contact && otherCount > recent.length && (
            <Link href={`/w/${slug}/contacts?c=${contact.id}`} className="self-start pt-0.5 text-xs text-muted-foreground hover:text-foreground">
              {tx("View all conversations →", "Vedi tutte le conversazioni →")}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
