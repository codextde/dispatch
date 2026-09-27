"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { aiRequest, useAiStatus, type AiSummaryResult } from "./use-ai"

const SENTIMENT: Record<NonNullable<AiSummaryResult["sentiment"]>, { label: string; className: string }> = {
  positive: { label: "Positive", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  neutral: { label: "Neutral", className: "bg-muted text-muted-foreground" },
  negative: { label: "Frustrated", className: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  urgent: { label: "Urgent", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
}

/**
 * "Summarize" button that expands into a TL;DR card for the conversation.
 * Summaries are cached server-side until the conversation changes.
 * Renders nothing when AI is disabled for the workspace.
 */
export function AiSummary(props: {
  slug: string
  conversationId: string
  className?: string
  /** Icon-only trigger */
  compact?: boolean
}) {
  // Fresh state per conversation
  return <AiSummaryInner key={props.conversationId} {...props} />
}

function AiSummaryInner({
  slug,
  conversationId,
  className,
  compact = false,
}: {
  slug: string
  conversationId: string
  className?: string
  compact?: boolean
}) {
  const { data: status } = useAiStatus(slug)
  const [open, setOpen] = useState(false)
  const summarize = useMutation({
    mutationKey: ["ai", slug, "summary", conversationId],
    mutationFn: (refresh: boolean) =>
      aiRequest<{ summary: AiSummaryResult; cached: boolean }>(`/api/w/${slug}/ai/summarize`, { conversationId, refresh }),
  })

  if (!status?.enabled) return null

  const summary = summarize.data?.summary

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon-sm" : "sm"}
        className={cn("w-fit gap-1.5", className)}
        onClick={() => {
          setOpen(true)
          summarize.mutate(false)
        }}
        aria-label="Summarize conversation"
      >
        <Sparkles className="text-brand" />
        {!compact && "Summarize"}
      </Button>
    )
  }

  return (
    <section
      className={cn("relative overflow-hidden rounded-xl border bg-card shadow-xs", className)}
      aria-label="AI summary"
      aria-busy={summarize.isPending}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" aria-hidden />
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Sparkles className="size-3.5 text-brand" />
        <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">TL;DR</span>
        {summary?.sentiment && (
          <span className={cn("rounded-md px-1.5 py-px text-[11px] font-medium", SENTIMENT[summary.sentiment].className)}>
            {SENTIMENT[summary.sentiment].label}
          </span>
        )}
        <div className="ml-auto flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => summarize.mutate(true)}
            disabled={summarize.isPending}
            aria-label="Regenerate summary"
            title="Regenerate"
          >
            <RefreshCw className={cn(summarize.isPending && "animate-spin")} />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setOpen(false)} aria-label="Close summary">
            <X />
          </Button>
        </div>
      </div>
      <div className="px-3.5 pt-1.5 pb-3.5" aria-live="polite">
        {summarize.isPending && !summary ? (
          <div className="flex flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-1 h-3 w-3/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : summarize.isError ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[13px] text-destructive">{summarize.error.message}</p>
            <Button size="xs" variant="outline" onClick={() => summarize.mutate(false)}>
              Retry
            </Button>
          </div>
        ) : summary ? (
          <div className={cn("flex flex-col gap-2.5 transition-opacity", summarize.isPending && "opacity-50")}>
            <p className="text-[14px] leading-snug font-medium text-balance">{summary.tldr}</p>
            {summary.points.length > 0 && (
              <ul className="flex flex-col gap-1 text-[13px] text-foreground/85">
                {summary.points.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary.nextSteps.length > 0 && (
              <div className="rounded-lg bg-surface px-2.5 py-2">
                <div className="mb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Next steps</div>
                <ul className="flex flex-col gap-0.5 text-[13px]">
                  {summary.nextSteps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
