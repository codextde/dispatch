"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Languages,
  ListCollapse,
  ListPlus,
  MessageSquareReply,
  RefreshCw,
  Smile,
  Sparkles,
  SpellCheck,
  BriefcaseBusiness,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"
import DOMPurify from "isomorphic-dompurify"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { aiRequest, aiSettingsHref, useAiStatus, type AiTextResult, type ImproveMode, type ReplyTone } from "./use-ai"

type View =
  | { name: "menu" }
  | { name: "draft" }
  | { name: "translate" }
  | { name: "loading"; label: string }
  | { name: "result"; result: AiTextResult; label: string }
  | { name: "error"; message: string }

type Request = { url: string; body: Record<string, unknown>; label: string }

const TONES: { value: ReplyTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "concise", label: "Concise" },
]

const IMPROVE: { mode: ImproveMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "fix", label: "Fix spelling & grammar", icon: SpellCheck },
  { mode: "shorter", label: "Make shorter", icon: ListCollapse },
  { mode: "longer", label: "Make longer", icon: ListPlus },
  { mode: "friendlier", label: "Make friendlier", icon: Smile },
  { mode: "formal", label: "Make more formal", icon: BriefcaseBusiness },
]

const LANGUAGES = ["English", "German", "French", "Spanish", "Italian", "Dutch", "Portuguese", "Polish", "Swedish", "Japanese"]

/**
 * AI writing assistant for the composer: draft a reply from the conversation,
 * rewrite / fix / translate the current draft, preview, then insert or replace.
 * Renders nothing when AI is disabled (admins get a setup hint instead).
 */
export function AiAssist({
  slug,
  conversationId,
  getDraftText,
  onInsert,
  onReplace,
  className,
  align = "end",
  side = "top",
  shortcut = true,
}: {
  slug: string
  conversationId?: string | null
  /** Current draft as plain text */
  getDraftText: () => string
  /** Insert generated HTML into the composer (e.g. at the cursor / replacing the selection) */
  onInsert: (html: string) => void
  /** Replace the whole draft; when omitted only "Insert" is offered */
  onReplace?: (html: string) => void
  className?: string
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  /** Open with ⌘J / Ctrl+J */
  shortcut?: boolean
}) {
  const { locale } = useI18n()
  const tx = (en: string, it: string) => locale === "it" ? it : en
  const { data: status } = useAiStatus(slug)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ name: "menu" })
  const [tone, setTone] = useState<ReplyTone>("friendly")
  const [instructions, setInstructions] = useState("")
  const [language, setLanguage] = useState("")
  const [draftText, setDraftText] = useState("")
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequest = useRef<Request | null>(null)

  const enabled = Boolean(status?.enabled)

  useEffect(() => {
    if (!shortcut || !enabled) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut, enabled])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setDraftText(getDraftText().trim())
      setView({ name: "menu" })
    } else {
      abortRef.current?.abort()
    }
  }

  const run = async (req: Request) => {
    lastRequest.current = req
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setView({ name: "loading", label: req.label })
    try {
      const result = await aiRequest<AiTextResult>(req.url, req.body, controller.signal)
      if (!controller.signal.aborted) setView({ name: "result", result, label: req.label })
    } catch (err) {
      if (controller.signal.aborted) return
      setView({ name: "error", message: err instanceof Error ? err.message : "Something went wrong" })
    }
  }

  const draftReply = () =>
    run({
      url: `/api/w/${slug}/ai/draft`,
      body: { conversationId, tone, instructions: instructions.trim() || undefined, currentDraft: draftText || undefined },
      label: tx("Reply draft", "Bozza di risposta"),
    })
  const improve = (mode: ImproveMode, label: string) =>
    run({ url: `/api/w/${slug}/ai/improve`, body: { text: draftText, mode }, label })
  const translate = (lang: string) =>
    run({ url: `/api/w/${slug}/ai/translate`, body: { text: draftText, language: lang }, label: tx(`Translated to ${lang}`, `Tradotto in ${lang}`) })

  const apply = (html: string, how: "insert" | "replace") => {
    if (how === "replace" && onReplace) onReplace(html)
    else onInsert(html)
    setOpen(false)
  }

  if (!status) return null
  if (!enabled && !status.canConfigure) return null

  const trigger = (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn("text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground", className)}
        aria-label={tx("AI assistant", "Assistente IA")}
      >
        <Sparkles />
      </Button>
    </PopoverTrigger>
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          {tx("AI assistant", "Assistente IA")} {shortcut && enabled && <Kbd>⌘J</Kbd>}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align={align} side={side} className="w-[min(22rem,calc(100vw-2rem))] p-0" onOpenAutoFocus={(e) => view.name === "menu" && e.preventDefault()}>
        {!enabled ? (
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-brand" /> {tx("Set up the AI assistant", "Configura l’assistente IA")}
            </div>
            <p className="text-[13px] text-muted-foreground">
              {tx("Draft replies, summarize threads and polish your writing with your own Anthropic or OpenAI-compatible key.", "Prepara risposte, riassumi conversazioni e migliora i testi con una tua chiave Anthropic o compatibile con OpenAI.")}
            </p>
            <Button asChild size="sm" className="mt-1 self-start">
              <Link href={aiSettingsHref(slug)} onClick={() => setOpen(false)}>
                {tx("Configure AI", "Configura IA")}
              </Link>
            </Button>
          </div>
        ) : view.name === "menu" ? (
          <div className="flex flex-col p-1">
            <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
              <Sparkles className="size-3.5 text-brand" />
              <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{tx("AI assistant", "Assistente IA")}</span>
            </div>
            {conversationId && (
              <MenuItem icon={MessageSquareReply} onClick={() => setView({ name: "draft" })} chevron>
                {draftText ? tx("Continue my draft", "Continua la bozza") : tx("Draft a reply", "Prepara una risposta")}
              </MenuItem>
            )}
            <div className="my-1 h-px bg-border" />
            {IMPROVE.map((i) => (
              <MenuItem key={i.mode} icon={i.icon} disabled={!draftText} onClick={() => improve(i.mode, locale === "it" ? ({ fix: "Correggi ortografia e grammatica", shorter: "Accorcia", longer: "Allunga", friendlier: "Rendi più cordiale", formal: "Rendi più formale" }[i.mode]) : i.label)}>
                {locale === "it" ? ({ fix: "Correggi ortografia e grammatica", shorter: "Accorcia", longer: "Allunga", friendlier: "Rendi più cordiale", formal: "Rendi più formale" }[i.mode]) : i.label}
              </MenuItem>
            ))}
            <MenuItem icon={Languages} disabled={!draftText} onClick={() => setView({ name: "translate" })} chevron>
              {tx("Translate…", "Traduci…")}
            </MenuItem>
            {!draftText && <p className="px-2.5 pt-1 pb-2 text-xs text-muted-foreground">{tx("Write something to rewrite or translate it.", "Scrivi un testo da riscrivere o tradurre.")}</p>}
          </div>
        ) : view.name === "draft" ? (
          <form
            className="flex flex-col gap-3 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void draftReply()
            }}
          >
            <SubHeader title={draftText ? tx("Continue my draft", "Continua la bozza") : tx("Draft a reply", "Prepara una risposta")} onBack={() => setView({ name: "menu" })} />
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5" role="radiogroup" aria-label={tx("Tone", "Tono")}>
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={tone === t.value}
                  onClick={() => setTone(t.value)}
                  className={cn(
                    "h-7 flex-1 rounded-md text-[12.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    tone === t.value && "bg-background text-foreground shadow-xs dark:bg-accent"
                  )}
                >
                  {locale === "it" ? ({ friendly: "Cordiale", formal: "Formale", concise: "Conciso" }[t.value]) : t.label}
                </button>
              ))}
            </div>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void draftReply()
                }
              }}
              placeholder={tx("Optional: what should the reply say? e.g. “Offer a refund and apologize for the delay”", "Facoltativo: cosa dovrebbe dire la risposta? es. “Offri un rimborso e scusati per il ritardo”")}
              aria-label={tx("Instructions", "Istruzioni")}
              rows={3}
              maxLength={2000}
              className="min-h-20 resize-none text-[13px]"
              autoFocus
            />
            <Button type="submit" size="sm">
              <Wand2 /> {tx("Generate", "Genera")}
            </Button>
          </form>
        ) : view.name === "translate" ? (
          <form
            className="flex flex-col gap-3 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (language.trim()) void translate(language.trim())
            }}
          >
            <SubHeader title={tx("Translate draft", "Traduci bozza")} onBack={() => setView({ name: "menu" })} />
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => translate(l)}
                  className="h-7 rounded-md border px-2 text-[12.5px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder={tx("Other language…", "Un’altra lingua…")}
                aria-label={tx("Target language", "Lingua di destinazione")}
                maxLength={60}
                className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-input/30"
              />
              <Button type="submit" size="sm" disabled={!language.trim()}>
                {tx("Translate", "Traduci")}
              </Button>
            </div>
          </form>
        ) : view.name === "loading" ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center" aria-live="polite">
            <span className="relative flex size-9 items-center justify-center rounded-full bg-brand-soft">
              <Sparkles className="size-4 animate-pulse text-brand" />
            </span>
            <div className="text-[13px] font-medium">{view.label === tx("Reply draft", "Bozza di risposta") ? tx("Writing a reply…", "Sto preparando la risposta…") : tx("Working on it…", "Elaborazione in corso…")}</div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                abortRef.current?.abort()
                setView({ name: "menu" })
              }}
            >
              {tx("Cancel", "Annulla")}
            </Button>
          </div>
        ) : view.name === "error" ? (
          <div className="flex flex-col gap-3 p-4" role="alert">
            <p className="text-[13px] text-destructive">{view.message}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => lastRequest.current && run(lastRequest.current)}>
                <RefreshCw /> {tx("Try again", "Riprova")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setView({ name: "menu" })}>
                {tx("Back", "Indietro")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Sparkles className="size-3.5 text-brand" />
              <span className="text-[12.5px] font-medium">{view.label}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(view.result.text)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  } catch {
                    toast.error(tx("Couldn’t copy to the clipboard", "Impossibile copiare negli appunti"))
                  }
                }}
                className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={tx("Copy text", "Copia testo")}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            <div
              className="scrollbar-thin max-h-72 overflow-y-auto px-3 py-2.5 text-[13px] leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(view.result.html) }}
            />
            <div className="flex items-center gap-1.5 border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => lastRequest.current && run(lastRequest.current)}
                aria-label={tx("Regenerate", "Rigenera")}
                title={tx("Regenerate", "Rigenera")}
              >
                <RefreshCw />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setView({ name: "menu" })}>
                {tx("Back", "Indietro")}
              </Button>
              <div className="ml-auto flex gap-1.5">
                {onReplace && (
                  <Button size="sm" variant={draftText ? "default" : "outline"} onClick={() => apply(view.result.html, "replace")}>
                    {tx("Replace draft", "Sostituisci bozza")}
                  </Button>
                )}
                <Button size="sm" variant={onReplace && draftText ? "outline" : "default"} onClick={() => apply(view.result.html, "insert")}>
                  {tx("Insert", "Inserisci")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  disabled,
  chevron,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  chevron?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-45"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{children}</span>
      {chevron && <ChevronRight className="size-3.5 text-muted-foreground" />}
    </button>
  )
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { locale } = useI18n()
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={locale === "it" ? "Indietro" : "Back"}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <span className="text-[13px] font-medium">{title}</span>
    </div>
  )
}
