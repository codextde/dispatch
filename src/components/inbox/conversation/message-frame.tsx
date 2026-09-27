"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Ellipsis } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Renders sanitized email HTML in a sandboxed iframe:
 *  - `sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"`
 *    (no scripts; same-origin only so the parent can measure/adjust the DOM)
 *  - `<base target="_blank">` so links open in a new tab
 *  - auto height (ResizeObserver) and collapsed quoted text ("…" toggle)
 * Rich HTML emails render on a white "paper" card; plain text and messages
 * written in Dispatch follow the app theme.
 */
const QUOTE_SELECTORS = [
  ".dispatch-quote",
  ".gmail_quote",
  "#divRplyFwdMsg",
  "#appendonsend",
  ".yahoo_quoted",
  ".moz-cite-prefix",
  "blockquote[type=cite]",
]

function buildDocument(html: string, opts: { dark: boolean }) {
  const fg = opts.dark ? "#ececec" : "#1b1b1b"
  const muted = opts.dark ? "#a3a3a3" : "#6b6b6b"
  const link = opts.dark ? "#7cb3ff" : "#1a66d6"
  const border = opts.dark ? "#3a3a3a" : "#d9d9d9"
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="color-scheme" content="${opts.dark ? "dark" : "light"}"><style>
html,body{margin:0;padding:0;background:transparent}
body{font:14px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${fg};word-wrap:break-word;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
img{max-width:100%;height:auto}
img[data-blocked-src]{display:inline-block;min-width:16px;min-height:16px;background:repeating-linear-gradient(135deg,${border} 0 1px,transparent 1px 6px);border-radius:3px}
table{max-width:100%}
pre{white-space:pre-wrap}
a{color:${link}}
p{margin:0 0 .6em}
blockquote[type=cite],.dispatch-quote blockquote{margin:.4em 0 0 .6ex;border-left:2px solid ${border};padding-left:1ex;color:${muted}}
.dsp-hidden{display:none!important}
</style></head><body>${html}</body></html>`
}

export function MessageFrame({ html, simple, className, title = "Email message" }: { html: string; simple: boolean; className?: string; title?: string }) {
  const { resolvedTheme } = useTheme()
  const dark = simple && resolvedTheme === "dark"
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(simple ? 40 : 120)
  const [hasQuote, setHasQuote] = useState(false)
  const [showQuote, setShowQuote] = useState(false)
  const hidden = useRef<HTMLElement[]>([])
  const observer = useRef<ResizeObserver | null>(null)
  const srcDoc = useMemo(() => buildDocument(html, { dark }), [html, dark])

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)
    setHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev))
  }, [])

  const onLoad = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc?.body) return
    // Collapse the first quoted section (and everything after an Outlook reply header).
    hidden.current = []
    const quote = doc.querySelector<HTMLElement>(QUOTE_SELECTORS.join(","))
    if (quote) {
      const before = doc.createRange()
      before.setStartBefore(doc.body.firstChild ?? doc.body)
      before.setEndBefore(quote)
      const visibleText = before.toString().trim()
      if (visibleText.length > 0) {
        const targets: HTMLElement[] = [quote]
        if (quote.id === "divRplyFwdMsg" || quote.id === "appendonsend") {
          let sib = quote.nextElementSibling as HTMLElement | null
          while (sib) {
            targets.push(sib)
            sib = sib.nextElementSibling as HTMLElement | null
          }
        }
        const prev = quote.previousElementSibling as HTMLElement | null
        if (prev && /wrote:\s*$|schrieb:\s*$|a écrit\s*:\s*$/i.test(prev.textContent ?? "")) targets.unshift(prev)
        for (const t of targets) t.classList.add("dsp-hidden")
        hidden.current = targets
      }
    }
    setHasQuote(hidden.current.length > 0)
    setShowQuote(false)
    measure()
    observer.current?.disconnect()
    observer.current = new ResizeObserver(() => measure())
    observer.current.observe(doc.body)
    for (const img of doc.images) img.addEventListener("load", measure, { once: true })
  }, [measure])

  useEffect(() => () => observer.current?.disconnect(), [])

  const toggleQuote = () => {
    const next = !showQuote
    for (const el of hidden.current) el.classList.toggle("dsp-hidden", !next)
    setShowQuote(next)
    requestAnimationFrame(measure)
  }

  return (
    <div className={cn(!simple && "rounded-lg bg-white p-3 text-black ring-1 ring-black/5 dark:ring-white/10", className)}>
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={onLoad}
        style={{ height }}
        className="block w-full border-0 bg-transparent"
      />
      {hasQuote && (
        <button
          type="button"
          onClick={toggleQuote}
          aria-expanded={showQuote}
          aria-label={showQuote ? "Hide quoted text" : "Show quoted text"}
          className={cn(
            "mt-1 flex h-4 items-center rounded-full px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            simple ? "bg-muted text-muted-foreground hover:bg-accent" : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
          )}
        >
          <Ellipsis className="size-4" />
        </button>
      )}
    </div>
  )
}
