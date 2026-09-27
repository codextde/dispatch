"use client"

import { useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/components/app/org-provider"
import { useServerAction } from "@/components/settings/use-server-action"
import { MicroLabel, SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { updateInboxCredentialsAction } from "@/server/workspace/actions/inboxes"
import { ConnectionTestPanel } from "@/components/settings/inboxes/connection-test"
import { ServerFields, validateServerDraft, type ServerDraft } from "@/components/settings/inboxes/server-fields"
import type { ConnectionTestResult, InboxDetail } from "@/components/settings/inboxes/types"

/**
 * Update IMAP/SMTP server settings and rotate passwords. Blank passwords keep
 * the stored ones. The server tests the new settings and only saves them when
 * IMAP works.
 */
export function CredentialsDialog({ inbox }: { inbox: InboxDetail }) {
  const { org } = useOrg()
  const initialImap: ServerDraft = {
    host: inbox.connection.imap?.host ?? "",
    port: inbox.connection.imap?.port ?? 993,
    secure: inbox.connection.imap?.secure ?? true,
    user: inbox.connection.imap?.user ?? inbox.email,
    pass: "",
  }
  const initialSmtp: ServerDraft = {
    host: inbox.connection.smtp?.host ?? "",
    port: inbox.connection.smtp?.port ?? 465,
    secure: inbox.connection.smtp?.secure ?? true,
    user: inbox.connection.smtp?.user ?? initialImap.user,
    pass: "",
  }
  const initialSame = !inbox.connection.smtp || inbox.connection.smtp.user === initialImap.user

  const [open, setOpen] = useState(false)
  const [imap, setImap] = useState(initialImap)
  const [smtp, setSmtp] = useState(initialSmtp)
  const [same, setSame] = useState(initialSame)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ConnectionTestResult | null>(null)
  const { pending, run } = useServerAction()

  const reset = () => {
    setImap(initialImap)
    setSmtp(initialSmtp)
    setSame(initialSame)
    setErrors({})
    setResult(null)
  }

  const submit = () => {
    const e = {
      ...validateServerDraft("imap", imap, { requirePassword: false, requireUser: true }),
      ...validateServerDraft("smtp", smtp, { requirePassword: false, requireUser: !same }),
    }
    setErrors(e)
    if (Object.keys(e).length) return
    setResult(null)
    void run(
      () =>
        updateInboxCredentialsAction({
          slug: org.slug,
          scope: inbox.scope,
          id: inbox.id,
          credentials: {
            imap: { host: imap.host, port: Number(imap.port), secure: imap.secure, user: imap.user.trim(), pass: imap.pass || undefined },
            smtp: {
              host: smtp.host,
              port: Number(smtp.port),
              secure: smtp.secure,
              user: (same ? imap.user : smtp.user).trim(),
              pass: same ? undefined : smtp.pass || undefined,
            },
            smtpSameAsImap: same,
          },
        }),
      {
        onSuccess: (res) => {
          setResult(res.result)
          if (res.saved) setOpen(false)
          else toast.error("Couldn't sign in with these settings — nothing was saved.")
        },
        success: (res) =>
          res.saved
            ? res.result.smtp.ok
              ? "Credentials updated — syncing again"
              : "Credentials saved. Incoming mail works, but sending still fails."
            : "",
        onError: (_err, fieldErrors) => fieldErrors && setErrors(fieldErrors),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        setOpen(o)
        if (o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound /> Update credentials
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 pt-5 pb-4">
          <DialogTitle>Update credentials</DialogTitle>
          <DialogDescription>
            Change server settings or rotate the password for {inbox.email}. Leave the password empty to keep the current one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <section className="flex flex-col gap-3">
            <MicroLabel>Incoming mail · IMAP</MicroLabel>
            <ServerFields
              kind="imap"
              value={imap}
              onChange={setImap}
              errors={errors}
              passwordOptional
              passwordPlaceholder="••••••••  (unchanged)"
            />
          </section>
          <section className="flex flex-col gap-3">
            <MicroLabel>Outgoing mail · SMTP</MicroLabel>
            <ServerFields kind="smtp" value={smtp} onChange={setSmtp} errors={errors} showCredentials={false} />
            <SettingsRow
              label="Use the same username and password as IMAP"
              htmlFor="cred-smtp-same"
              className="rounded-lg border px-3 py-2.5 first:pt-2.5 last:pb-2.5"
            >
              <Switch id="cred-smtp-same" checked={same} onCheckedChange={setSame} />
            </SettingsRow>
            {!same && (
              <ServerFields
                kind="smtp"
                value={smtp}
                onChange={setSmtp}
                errors={errors}
                hideServer
                passwordOptional
                passwordPlaceholder="••••••••  (unchanged)"
              />
            )}
          </section>
          {(pending || result) && (
            <ConnectionTestPanel
              running={pending}
              result={result}
              imapDetail={`${imap.host}:${imap.port}`}
              smtpDetail={`${smtp.host}:${smtp.port}`}
            />
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 px-5 py-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Test &amp; save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
