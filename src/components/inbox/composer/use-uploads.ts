"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { AttachmentInfo } from "@/lib/inbox/types"

export type UploadItem = {
  key: string
  filename: string
  size: number
  progress: number
  status: "uploading" | "done" | "error"
  attachment?: AttachmentInfo
  error?: string
}

function uploadFile(slug: string, file: File, onProgress: (p: number) => void): Promise<AttachmentInfo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/api/w/${slug}/uploads`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: { error?: { message?: string } } & Partial<AttachmentInfo> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as AttachmentInfo)
      else reject(new Error(body.error?.message || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Network error while uploading"))
    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
}

/**
 * Attachment uploads for composers. Files upload immediately (with
 * progress); `ids` are the uploaded attachment ids to link on save/send.
 */
export function useUploads(slug: string, maxMb: number, initial: AttachmentInfo[] = []) {
  const [items, setItems] = useState<UploadItem[]>(() =>
    initial.map((a) => ({ key: a.id, filename: a.filename, size: a.size, progress: 1, status: "done" as const, attachment: a }))
  )
  const counter = useRef(0)

  const add = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`${file.name} is larger than ${maxMb} MB`)
          continue
        }
        const key = `upload-${++counter.current}`
        setItems((prev) => [...prev, { key, filename: file.name, size: file.size, progress: 0, status: "uploading" }])
        uploadFile(slug, file, (p) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, progress: p } : i))))
          .then((attachment) =>
            setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: "done", progress: 1, attachment } : i)))
          )
          .catch((err: Error) => {
            toast.error(`${file.name}: ${err.message}`)
            setItems((prev) => prev.filter((i) => i.key !== key))
          })
      }
    },
    [slug, maxMb]
  )

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => i.key !== key)), [])
  const reset = useCallback((next: AttachmentInfo[] = []) => {
    setItems(next.map((a) => ({ key: a.id, filename: a.filename, size: a.size, progress: 1, status: "done" as const, attachment: a })))
  }, [])

  const ids = items.filter((i) => i.status === "done" && i.attachment).map((i) => i.attachment!.id)
  const uploading = items.some((i) => i.status === "uploading")
  return { items, ids, uploading, add, remove, reset }
}
