"use client"

import { useState } from "react"
import { CalendarClock, ChevronDown, MessageSquareText, Paperclip, Send, Signature } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useResponses } from "@/hooks/inbox/queries"
import { useShortcutLabel } from "@/hooks/inbox/use-hotkeys"
import { timePresets } from "@/lib/inbox/snooze"
import type { AccountSummary, CannedResponseItem } from "@/lib/inbox/types"
import { useInbox } from "../inbox-provider"
import { DateTimeForm } from "../pickers"
import { useI18n } from "@/lib/i18n"

/** Searchable canned responses. `onPick` receives the raw response (variables are rendered by the caller). */
export function ResponsePicker({ onPick }: { onPick: (r: CannedResponseItem) => void }) {
  const { slug } = useInbox()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { data = [], isLoading } = useResponses(slug, open)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("inboxUiInsertResponse")}>
              <MessageSquareText />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("responses")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <Command>
          <CommandInput placeholder={t("searchResponsesPlaceholder")} autoFocus />
          <CommandList className="max-h-80">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <CommandEmpty>
                <span className="block">{t("inboxUiNoResponses")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t("inboxUiCreateResponses")}</span>
              </CommandEmpty>
            )}
            {(["personal", "team", "org"] as const).map((scope) => {
              const list = data.filter((r) => r.scope === scope)
              if (!list.length) return null
              return (
                <CommandGroup key={scope} heading={scope === "personal" ? t("inboxUiMine") : scope === "team" ? t("teams") : t("workspace")}>
                  {list.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`${r.name} ${r.shortcut ?? ""} ${r.body.replace(/<[^>]+>/g, " ").slice(0, 200)}`}
                      onSelect={() => {
                        onPick(r)
                        setOpen(false)
                      }}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {r.shortcut && <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">/{r.shortcut}</span>}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{r.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useI18n()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("inboxUiAttachFiles")}>
          <label className="cursor-pointer">
            <Paperclip />
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ""
                if (files.length) onFiles(files)
              }}
            />
          </label>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("inboxUiAttachFiles")}</TooltipContent>
    </Tooltip>
  )
}

/** Signature selector: "none" or a signature id. */
export function SignatureSelect({ value, onChange, accountId }: { value: string | null; onChange: (id: string | null) => void; accountId: string | null }) {
  const { bootstrap, signature } = useInbox()
  const { t } = useI18n()
  const options = bootstrap.signatures.filter((s) => !s.accountId || s.accountId === accountId)
  if (!options.length) return null
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 max-w-40 gap-1 px-2 text-xs text-muted-foreground" aria-label={t("inboxUiSignature")}>
              <Signature className="size-3.5" />
              <span className="truncate max-sm:hidden">{value ? (signature(value)?.name ?? t("inboxUiSignature")) : t("inboxUiNoSignature")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("inboxUiSignature")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("inboxUiSignature")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
          {options.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              <span className="truncate">{s.name}</span>
              {s.isOrg && <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">{t("teams")}</span>}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value="none">{t("inboxUiNoSignature")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** From selector: accounts I can reply from + their aliases. */
export function FromSelect({
  accounts,
  accountId,
  fromEmail,
  onChange,
}: {
  accounts: AccountSummary[]
  accountId: string | null
  fromEmail: string
  onChange: (accountId: string, fromEmail: string) => void
}) {
  const { t } = useI18n()
  const current = accounts.find((a) => a.id === accountId)
  const label = current ? `${current.fromName || current.name} <${fromEmail || current.email}>` : t("inboxUiChooseInbox")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 max-w-48 items-center gap-1 rounded px-1 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring max-sm:max-w-[30vw]"
          aria-label={t("inboxUiSendFrom")}
        >
          {current && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(26rem,calc(100vw-1rem))]">
        {accounts.map((a) => (
          <div key={a.id}>
            {[a.email, ...a.aliases].map((addr) => (
              <DropdownMenuItem key={`${a.id}:${addr}`} onSelect={() => onChange(a.id, addr)}>
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                <span className="truncate">
                  {a.fromName || a.name} <span className="text-muted-foreground">&lt;{addr}&gt;</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {!accounts.length && <DropdownMenuItem disabled>{t("inboxUiNoSendInbox")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Send split button: Send (⌘↵), Send & close (⌘⇧↵), Send later. */
export function SendButton({
  onSend,
  disabled,
  pending,
  allowClose = true,
  label,
}: {
  onSend: (opts: { close?: boolean; sendAt?: Date }) => void
  disabled?: boolean
  pending?: boolean
  allowClose?: boolean
  label?: string
}) {
  const { t, locale } = useI18n()
  const buttonLabel = label ?? (locale === "it" ? "Invia" : "Send")
  const shortcutLabel = useShortcutLabel()
  const [later, setLater] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const presets = menuOpen ? timePresets() : []
  return (
    <Popover open={later} onOpenChange={setLater}>
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" disabled={disabled || pending} onClick={() => onSend({})} className="max-md:h-9">
              {pending ? <Spinner /> : <Send />}
              {buttonLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {buttonLabel} <Kbd>{shortcutLabel("mod+Enter")[0]}</Kbd>
          </TooltipContent>
        </Tooltip>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverAnchor asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" disabled={disabled || pending} aria-label={locale === "it" ? "Altre opzioni di invio" : "More send options"} className="border-l border-primary-foreground/20 max-md:size-9">
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          </PopoverAnchor>
          <DropdownMenuContent align="end" side="top" className="w-60">
            {allowClose && (
              <DropdownMenuItem onSelect={() => onSend({ close: true })}>
                <Send /> {locale === "it" ? `${buttonLabel} e chiudi` : `${buttonLabel} & close`}
                <span className="ml-auto text-xs text-muted-foreground">{shortcutLabel("mod+shift+Enter")[0]}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{locale === "it" ? "Invia più tardi" : "Send later"}</DropdownMenuLabel>
            {presets.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => onSend({ sendAt: p.date })}>
                <CalendarClock /> {locale === "it" ? ({ later: "Più tardi oggi", tomorrow: "Domani", weekend: "Questo fine settimana", "next-week": "La prossima settimana", month: "Tra un mese" } as Record<string, string>)[p.id] ?? p.label : p.label}
                <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{p.hint}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => setTimeout(() => setLater(true), 0)}>
              <CalendarClock /> {locale === "it" ? "Scegli data e ora…" : "Pick date & time…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <PopoverContent align="end" side="top" className="w-auto p-3">
        <DateTimeForm
          submitLabel={locale === "it" ? "Programma" : "Schedule"}
          onSubmit={(d) => {
            setLater(false)
            onSend({ sendAt: d })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
