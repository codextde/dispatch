"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  Building2,
  Check,
  Copy,
  Lock,
  Mail,
  MoreHorizontal,
  Merge,
  Phone,
  Share2,
  SquarePen,
  Trash2,
  Briefcase,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/components/app/org-provider"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { CustomFieldsEditor, InlineField, TagInput } from "./contact-fields"
import {
  displayName,
  useContactDetail,
  useContactList,
  useContactMutations,
  type ContactConversation,
  type ContactDto,
  type ContactInput,
} from "./use-contacts"

export function composeHref(slug: string, email: string) {
  return `/w/${slug}/inbox?compose=${encodeURIComponent(email)}`
}

export function ConversationLink({ slug, c, compact }: { slug: string; c: ContactConversation; compact?: boolean }) {
  return (
    <Link
      href={`/w/${slug}/all/${c.id}`}
      className="group/conv -mx-2 flex flex-col gap-0.5 rounded-md px-2 py-2 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-2">
        {c.account && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.account.color }} aria-hidden />}
        <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", c.status === "closed" && "text-muted-foreground")}>
          {c.subject || "(no subject)"}
        </span>
        <time className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums" dateTime={c.lastActivityAt}>
          {formatDistanceToNow(new Date(c.lastActivityAt), { addSuffix: false })}
        </time>
      </span>
      {!compact && (
        <span className="flex min-w-0 items-center gap-2 pl-4 text-[12.5px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{c.snippet}</span>
          {c.status === "closed" && (
            <span className="shrink-0 rounded border px-1 text-[10.5px] font-medium tracking-wide uppercase">Closed</span>
          )}
        </span>
      )}
    </Link>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ContactDetail({
  slug,
  contactId,
  onDeleted,
  onMerged,
  tagSuggestions,
  className,
}: {
  slug: string
  contactId: string
  onDeleted?: () => void
  onMerged?: (id: string) => void
  tagSuggestions?: string[]
  className?: string
}) {
  const { data, isPending, isError } = useContactDetail(slug, contactId)
  if (isPending) return <DetailSkeleton className={className} />
  if (isError || !data) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground", className)}>
        This contact no longer exists or you don’t have access to it.
      </div>
    )
  }
  return (
    <ContactDetailBody
      key={data.contact.id}
      slug={slug}
      contact={data.contact}
      conversations={data.conversations}
      conversationTotal={data.conversationTotal}
      onDeleted={onDeleted}
      onMerged={onMerged}
      tagSuggestions={tagSuggestions}
      className={className}
    />
  )
}

function ContactDetailBody({
  slug,
  contact,
  conversations,
  conversationTotal,
  onDeleted,
  onMerged,
  tagSuggestions,
  className,
}: {
  slug: string
  contact: ContactDto
  conversations: ContactConversation[]
  conversationTotal: number
  onDeleted?: () => void
  onMerged?: (id: string) => void
  tagSuggestions?: string[]
  className?: string
}) {
  const { can } = useOrg()
  const { update, remove, merge } = useContactMutations(slug)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const editable = contact.canEdit
  const patch = (p: ContactInput) => update.mutate({ id: contact.id, patch: p })

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(contact.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn’t copy to the clipboard")
    }
  }

  const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ")

  return (
    <div className={cn("flex min-h-0 flex-col overflow-y-auto", className)}>
      <header className="flex flex-col gap-4 px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <UserAvatar name={contact.name} email={contact.email} src={contact.avatarUrl} size="lg" className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            <input
              key={contact.name ?? ""}
              defaultValue={contact.name ?? ""}
              readOnly={!editable}
              placeholder={editable ? "Add a name" : contact.email}
              aria-label="Name"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (contact.name ?? "")) patch({ name: v || null })
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={cn(
                "-mx-1 w-full min-w-0 truncate rounded-md bg-transparent px-1 text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60",
                editable && "hover:bg-accent/60 focus:bg-background focus:ring-2 focus:ring-ring/40 dark:focus:bg-input/30"
              )}
            />
            <p className="truncate text-[13px] text-muted-foreground">{subtitle || contact.email}</p>
            {contact.isPrivate && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Lock className="size-3" /> Private contact
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" className="flex-1 sm:flex-none">
            <Link href={composeHref(slug, contact.email)}>
              <SquarePen /> New email
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={copyEmail} aria-label="Copy email address">
            {copied ? <Check /> : <Copy />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy email"}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {can("contacts.manage") && (
                <DropdownMenuItem onSelect={() => patch({ isPrivate: !contact.isPrivate })}>
                  {contact.isPrivate ? <Share2 /> : <Lock />}
                  {contact.isPrivate ? "Share with workspace" : "Make private"}
                </DropdownMenuItem>
              )}
              {editable && (
                <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                  <Merge /> Merge duplicate into this…
                </DropdownMenuItem>
              )}
              {editable && <DropdownMenuSeparator />}
              {editable ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete contact
                </DropdownMenuItem>
              ) : (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">You can view but not edit this shared contact.</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-lg border bg-surface/60 p-3 text-center">
          <div>
            <dt className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Conversations</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{conversationTotal}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Messages</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{contact.messageCount}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Last contact</dt>
            <dd className="truncate text-[13px] font-semibold" title={contact.lastContactedAt ?? undefined}>
              {contact.lastContactedAt ? formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true }) : "Never"}
            </dd>
          </div>
        </dl>
      </header>

      <Section title="Details">
        <div className="flex flex-col gap-0.5">
          <InlineField label="Email" icon={<Mail className="size-3.5" />} type="email" value={contact.email} readOnly={!editable} onCommit={(v) => v && patch({ email: v })} />
          <InlineField label="Phone" icon={<Phone className="size-3.5" />} type="tel" value={contact.phone} readOnly={!editable} placeholder="Add phone" onCommit={(v) => patch({ phone: v || null })} />
          <InlineField label="Company" icon={<Building2 className="size-3.5" />} value={contact.company} readOnly={!editable} placeholder="Add company" onCommit={(v) => patch({ company: v || null })} />
          <InlineField label="Title" icon={<Briefcase className="size-3.5" />} value={contact.title} readOnly={!editable} placeholder="Add job title" onCommit={(v) => patch({ title: v || null })} />
          <div className="grid grid-cols-[88px_1fr] items-start gap-2">
            <span className="flex min-h-8 items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Users className="size-3.5" /> Tags
            </span>
            <TagInput value={contact.tags} readOnly={!editable} suggestions={tagSuggestions} onChange={(tags) => patch({ tags })} />
          </div>
          <InlineField
            label="Notes"
            multiline
            value={contact.notes}
            readOnly={!editable}
            placeholder="Add notes for your team…"
            onCommit={(v) => patch({ notes: v || null })}
          />
        </div>
      </Section>

      {(editable || Object.keys(contact.customFields).length > 0) && (
        <Section title="Custom fields">
          <CustomFieldsEditor value={contact.customFields} readOnly={!editable} onChange={(customFields) => patch({ customFields })} />
        </Section>
      )}

      <Section title={`Conversations${conversationTotal ? ` · ${conversationTotal}` : ""}`}>
        {conversations.length ? (
          <div className="flex flex-col">
            {conversations.map((c) => (
              <ConversationLink key={c.id} slug={slug} c={c} />
            ))}
            {conversationTotal > conversations.length && (
              <p className="pt-2 text-xs text-muted-foreground">Showing the {conversations.length} most recent conversations.</p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No conversations you can see yet.</p>
        )}
      </Section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {displayName(contact)}?</AlertDialogTitle>
            <AlertDialogDescription>
              The contact and its notes are removed{contact.isPrivate ? "" : " for everyone"}. Conversations stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(contact.id, {
                  onSuccess: () => {
                    toast.success("Contact deleted")
                    onDeleted?.()
                  },
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {mergeOpen && (
        <MergeDialog
          slug={slug}
          target={contact}
          onClose={() => setMergeOpen(false)}
          onMerge={(sourceId) =>
            merge.mutate(
              { targetId: contact.id, sourceIds: [sourceId] },
              {
                onSuccess: (merged) => {
                  toast.success("Contacts merged")
                  setMergeOpen(false)
                  onMerged?.(merged.id)
                },
              }
            )
          }
        />
      )}
    </div>
  )
}

function MergeDialog({
  slug,
  target,
  onClose,
  onMerge,
}: {
  slug: string
  target: ContactDto
  onClose: () => void
  onMerge: (sourceId: string) => void
}) {
  const [q, setQ] = useState(target.name?.split(" ")[0] ?? "")
  const { data } = useContactList(slug, { q: q || undefined, sort: "name" })
  const candidates = (data?.pages.flatMap((p) => p.contacts) ?? []).filter((c) => c.id !== target.id && c.canEdit).slice(0, 30)
  return (
    <CommandDialog open onOpenChange={(o) => !o && onClose()} title="Merge duplicate" description={`Pick a duplicate to merge into ${displayName(target)}`}>
      <CommandInput value={q} onValueChange={setQ} placeholder={`Merge a duplicate into ${displayName(target)}…`} />
      <CommandList>
        <CommandEmpty>No other contacts found.</CommandEmpty>
        <CommandGroup heading="The selected contact is merged into this one and then deleted">
          {candidates.map((c) => (
            <CommandItem key={c.id} value={`${c.name ?? ""} ${c.email} ${c.id}`} onSelect={() => onMerge(c.id)}>
              <UserAvatar name={c.name} email={c.email} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px]">{displayName(c)}</span>
                <span className="truncate text-xs text-muted-foreground">{c.email}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 p-5", className)} aria-busy aria-label="Loading contact">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-16 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  )
}
