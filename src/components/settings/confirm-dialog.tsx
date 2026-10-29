"use client"

import * as React from "react"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

/**
 * Confirmation dialog for destructive or important actions. `onConfirm`
 * resolves to `false` to keep the dialog open (e.g. when the action failed).
 * With `confirmText`, the user must type the text to enable the button.
 */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmText,
  children,
  onConfirm,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Require typing this text (e.g. the workspace slug) to confirm */
  confirmText?: string
  children?: React.ReactNode
  onConfirm: () => Promise<boolean | void> | boolean | void
}) {
  const { locale } = useI18n()
  const it = locale === "it"
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)

  const setOpen = (v: boolean) => {
    if (pending) return
    if (!v) setTyped("")
    setOpenState(v)
    onOpenChange?.(v)
  }

  const confirm = async () => {
    setPending(true)
    try {
      const res = await onConfirm()
      if (res !== false) {
        setPending(false)
        setTyped("")
        setOpenState(false)
        onOpenChange?.(false)
        return
      }
    } finally {
      setPending(false)
    }
  }

  const blocked = confirmText !== undefined && typed.trim() !== confirmText

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {confirmText !== undefined && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-text" className="text-[13px] text-muted-foreground">
              {it ? "Digita" : "Type"} <span className="font-mono font-medium text-foreground">{confirmText}</span> {it ? "per confermare" : "to confirm"}
            </label>
            <Input
              id="confirm-text"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked && !pending) void confirm()
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/80" : undefined}
            onClick={() => void confirm()}
            disabled={pending || blocked}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
