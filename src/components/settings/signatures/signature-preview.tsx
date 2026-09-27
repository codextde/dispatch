"use client"

import { fillSampleVariables, RichTextPreview } from "@/components/settings/rich-text-editor"
import { cn } from "@/lib/utils"
import { isBlankHtml } from "../responses/text"

export type PreviewUser = { name: string; title: string; email: string }

/** Signature rendered below a mock message, with the viewer's details filled in. */
export function SignaturePreview({ body, user, className, compact }: { body: string; user: PreviewUser; className?: string; compact?: boolean }) {
  const filled = fillSampleVariables(body, {
    "user.name": user.name,
    "user.title": user.title || "Your title",
    "user.email": user.email,
  })
  return (
    <div className={cn("rounded-lg border bg-card p-4", compact && "p-3", className)}>
      {!compact && (
        <div className="mb-3 flex flex-col gap-1.5" aria-hidden>
          <span className="h-2 w-3/4 rounded-full bg-muted" />
          <span className="h-2 w-1/2 rounded-full bg-muted" />
        </div>
      )}
      <div className={cn(!compact && "border-t border-dashed pt-3")}>
        {isBlankHtml(body) ? (
          <p className="text-sm text-muted-foreground">Your signature preview appears here.</p>
        ) : (
          <RichTextPreview html={filled} className={cn(compact && "line-clamp-4 text-[13px]")} />
        )}
      </div>
    </div>
  )
}
