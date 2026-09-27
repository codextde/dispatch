"use client"

import { useMemo, useState } from "react"
import { marked } from "marked"
import DOMPurify from "isomorphic-dompurify"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** Typography for rendered markdown (no typography plugin in this project). */
export const MARKDOWN_PROSE =
  "text-sm leading-relaxed text-foreground [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px] [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1:first-child]:mt-0 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2:first-child]:mt-0 [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_hr]:my-5 [&_hr]:border-border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2.5 [&_p:first-child]:mt-0 [&_table]:my-3 [&_table]:w-full [&_table]:text-left [&_td]:border-b [&_td]:border-border [&_td]:py-1.5 [&_th]:border-b [&_th]:border-border [&_th]:py-1.5 [&_th]:font-medium [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"

export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false, gfm: true, breaks: false })
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/** Markdown textarea with Write / Preview tabs. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
}) {
  const [tab, setTab] = useState<"write" | "preview">("write")
  const html = useMemo(() => (tab === "preview" ? renderMarkdown(value) : ""), [tab, value])
  return (
    <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface/60 px-1.5 py-1">
        <div role="tablist" aria-label="Editor mode" className="flex items-center gap-0.5">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${id}-${t}`}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] font-medium capitalize text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                tab === t && "bg-background text-foreground shadow-sm ring-1 ring-border"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="pr-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Markdown</span>
      </div>
      {tab === "write" ? (
        <Textarea
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          spellCheck
          className="min-h-64 rounded-none border-0 bg-transparent font-mono text-[13px] leading-relaxed focus-visible:ring-0 dark:bg-transparent"
        />
      ) : (
        <div id={`${id}-preview`} role="tabpanel" className="min-h-64 bg-card px-4 py-3">
          {value.trim() ? (
            <div className={MARKDOWN_PROSE} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
