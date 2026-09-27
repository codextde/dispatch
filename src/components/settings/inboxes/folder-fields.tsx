"use client"

import { useMemo } from "react"
import { Archive, Folder, Send, ShieldAlert, Trash2 } from "lucide-react"
import { Combobox, type ComboOption } from "@/components/settings/combobox"
import { FormField } from "@/components/settings/settings-ui"
import { Input } from "@/components/ui/input"
import type { FolderPaths, Mailbox } from "@/components/settings/inboxes/types"

const FIELDS: { key: keyof FolderPaths; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: "sentPath", label: "Sent", icon: <Send className="size-3.5" />, hint: "Where sent replies are stored" },
  { key: "archivePath", label: "Archive", icon: <Archive className="size-3.5" />, hint: "Closed conversations are moved here" },
  { key: "trashPath", label: "Trash", icon: <Trash2 className="size-3.5" />, hint: "Deleted conversations" },
  { key: "spamPath", label: "Spam", icon: <ShieldAlert className="size-3.5" />, hint: "Messages marked as spam" },
]

const NONE = "__none__"

/**
 * Special folder mapping. With a detected mailbox list (after a connection
 * test) the fields become searchable selects; otherwise free text.
 */
export function FolderFields({
  value,
  onChange,
  mailboxes,
}: {
  value: FolderPaths
  onChange: (value: FolderPaths) => void
  mailboxes?: Mailbox[] | null
}) {
  const options: ComboOption[] = useMemo(() => {
    if (!mailboxes) return []
    const opts = mailboxes.map((m) => ({
      value: m.path,
      label: m.path,
      hint: m.specialUse ? m.specialUse.replace(/^\\/, "") : undefined,
      icon: <Folder className="text-muted-foreground" />,
    }))
    return [{ value: NONE, label: "Don't use" }, ...opts]
  }, [mailboxes])

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map((f) => {
        const current = value[f.key]
        const opts =
          mailboxes && current && !mailboxes.some((m) => m.path === current)
            ? [...options, { value: current, label: current, hint: "not found on server" }]
            : options
        return (
          <FormField
            key={f.key}
            label={
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{f.icon}</span>
                {f.label}
              </span>
            }
            htmlFor={`folder-${f.key}`}
            description={f.hint}
          >
            {mailboxes ? (
              <Combobox
                id={`folder-${f.key}`}
                options={opts}
                value={current || NONE}
                onChange={(v) => onChange({ ...value, [f.key]: !v || v === NONE ? "" : v })}
                searchPlaceholder="Search folders…"
                emptyText="No folder found."
              />
            ) : (
              <Input
                id={`folder-${f.key}`}
                value={current}
                spellCheck={false}
                placeholder={f.key === "sentPath" ? "e.g. Sent" : f.key === "archivePath" ? "e.g. Archive" : f.key === "trashPath" ? "e.g. Trash" : "e.g. Junk"}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
                className="font-mono text-[13px]"
              />
            )}
          </FormField>
        )
      })}
    </div>
  )
}
