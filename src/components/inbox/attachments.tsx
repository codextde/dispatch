"use client"

import { useState } from "react"
import { Download, ExternalLink, File, FileImage, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatBytes } from "@/lib/inbox/format"
import type { AttachmentInfo } from "@/lib/inbox/types"
import { cn } from "@/lib/utils"
import type { UploadItem } from "./composer/use-uploads"

const IMAGE_RE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/
export const isPreviewableImage = (a: Pick<AttachmentInfo, "contentType">) => IMAGE_RE.test(a.contentType)
export const isPdf = (a: Pick<AttachmentInfo, "contentType">) => a.contentType === "application/pdf"

function FileIcon({ type, className }: { type: string; className?: string }) {
  if (type.startsWith("image/")) return <FileImage className={className} />
  if (type === "application/pdf" || type.startsWith("text/")) return <FileText className={className} />
  return <File className={className} />
}

/** Attachments of a message or comment: image thumbnails (lightbox), PDF preview, downloads. */
export function AttachmentList({ attachments, className }: { attachments: AttachmentInfo[]; className?: string }) {
  const [preview, setPreview] = useState<AttachmentInfo | null>(null)
  const visible = attachments.filter((a) => !a.isInline)
  if (!visible.length) return null
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {visible.map((a) =>
        isPreviewableImage(a) ? (
          <button
            key={a.id}
            type="button"
            onClick={() => setPreview(a)}
            className="group/att relative overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={a.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
            <img src={`${a.url}?inline=1`} alt={a.filename} loading="lazy" className="h-24 w-32 object-cover transition-transform group-hover/att:scale-[1.02]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1 text-left text-[11px] text-white">
              {a.filename}
            </span>
          </button>
        ) : (
          <div key={a.id} className="flex max-w-64 items-center gap-2 rounded-lg border bg-card py-1.5 pr-1 pl-2.5">
            <FileIcon type={a.contentType} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{a.filename}</span>
              <span className="block font-mono text-[10.5px] text-muted-foreground">{formatBytes(a.size)}</span>
            </span>
            {isPdf(a) && (
              <Button variant="ghost" size="icon-xs" asChild>
                <a href={`${a.url}?inline=1`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.filename}`}>
                  <ExternalLink />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" asChild>
              <a href={a.url} download={a.filename} aria-label={`Download ${a.filename}`}>
                <Download />
              </a>
            </Button>
          </div>
        )
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[92dvh] w-auto max-w-[min(92vw,1100px)] gap-2 p-2 sm:max-w-[min(92vw,1100px)]">
          <DialogTitle className="truncate px-1 pr-10 text-sm">{preview?.filename}</DialogTitle>
          <DialogDescription className="sr-only">Image preview</DialogDescription>
          {preview && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin file */}
              <img src={`${preview.url}?inline=1`} alt={preview.filename} className="max-h-[78dvh] w-auto rounded-md object-contain" />
              <div className="flex justify-end gap-2 px-1 pb-1">
                <Button variant="outline" size="sm" asChild>
                  <a href={preview.url} download={preview.filename}>
                    <Download /> Download
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Uploads in a composer (with progress and remove). */
export function UploadChips({ items, onRemove }: { items: UploadItem[]; onRemove: (key: string) => void }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <div key={i.key} className="relative flex max-w-56 items-center gap-2 overflow-hidden rounded-md border bg-card py-1 pr-1 pl-2">
          {i.status === "uploading" && (
            <span className="absolute inset-y-0 left-0 bg-brand-soft transition-[width]" style={{ width: `${Math.round(i.progress * 100)}%` }} aria-hidden />
          )}
          <FileIcon type={i.attachment?.contentType ?? ""} className="relative size-3.5 shrink-0 text-muted-foreground" />
          <span className="relative min-w-0 flex-1 truncate text-xs">{i.filename}</span>
          <span className="relative font-mono text-[10px] text-muted-foreground">
            {i.status === "uploading" ? `${Math.round(i.progress * 100)}%` : formatBytes(i.size)}
          </span>
          <Button variant="ghost" size="icon-xs" className="relative size-5" aria-label={`Remove ${i.filename}`} onClick={() => onRemove(i.key)}>
            <X />
          </Button>
        </div>
      ))}
    </div>
  )
}
