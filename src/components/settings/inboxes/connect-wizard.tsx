"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Info, Loader2, Mail, Plus, RefreshCw, ShieldCheck } from "lucide-react"
import { useOrg } from "@/components/app/org-provider"
import { useServerAction } from "@/components/settings/use-server-action"
import { ColorDot, FormField, MicroLabel, SettingsRow } from "@/components/settings/settings-ui"
import { Combobox } from "@/components/settings/combobox"
import { randomPresetColor } from "@/components/settings/color-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { connectInbox, testInboxConnection } from "@/server/workspace/actions/inboxes"
import { AccessEditor } from "@/components/settings/inboxes/access-editor"
import { ConnectionTestPanel } from "@/components/settings/inboxes/connection-test"
import { isEmail } from "@/components/settings/inboxes/email-chips"
import { FolderFields } from "@/components/settings/inboxes/folder-fields"
import { IdentityFields, SendingFields, SyncDaysField, type InboxSettingsDraft } from "@/components/settings/inboxes/inbox-fields"
import { GoogleGlyph, MicrosoftGlyph } from "@/components/settings/inboxes/provider-icon"
import { ServerFields, validateServerDraft, type ServerDraft } from "@/components/settings/inboxes/server-fields"
import type { AccessValue, ConnectOptions, ConnectionTestResult, FolderPaths, MailPreset } from "@/components/settings/inboxes/types"

type StepId = "provider" | "credentials" | "test" | "settings" | "access"

const STEP_LABELS: Record<StepId, string> = {
  provider: "Provider",
  credentials: "Account",
  test: "Test",
  settings: "Settings",
  access: "Access",
}

const EMPTY_FOLDERS: FolderPaths = { sentPath: "", archivePath: "", trashPath: "", spamPath: "" }

function presetIcon(id: string) {
  if (id === "gmail") return <GoogleGlyph className="size-5" />
  if (id === "outlook") return <MicrosoftGlyph className="size-5" />
  return <Mail className="size-5 text-muted-foreground" />
}

function shortLabel(p: MailPreset) {
  return p.label.replace(/\s*\(.*\)\s*$/, "")
}

function initialSettings(): InboxSettingsDraft {
  return {
    name: "",
    color: randomPresetColor(),
    teamId: null,
    fromName: "",
    syncDays: 30,
    aliases: [],
    autoCc: [],
    autoBcc: [],
    saveSentCopy: true,
    markReadOnServer: false,
  }
}

function blankServer(kind: "imap" | "smtp"): ServerDraft {
  return kind === "imap"
    ? { host: "", port: 993, secure: true, user: "", pass: "" }
    : { host: "", port: 465, secure: true, user: "", pass: "" }
}

function hostSummary(s: ServerDraft) {
  return s.host ? `${s.host}:${s.port || "?"} · ${s.secure ? "SSL/TLS" : "STARTTLS"}` : "not set"
}

/** "Connect inbox" button + multi-step wizard dialog (shared or personal inbox). */
export function ConnectInboxWizard({
  options,
  trigger,
}: {
  options: ConnectOptions
  trigger?: React.ReactNode
}) {
  const { org } = useOrg()
  const scope = options.scope
  const steps: StepId[] = scope === "shared" ? ["provider", "credentials", "test", "settings", "access"] : ["provider", "credentials", "test", "settings"]

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<StepId>("provider")
  const [presetId, setPresetId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [imap, setImap] = useState<ServerDraft>(blankServer("imap"))
  const [smtp, setSmtp] = useState<ServerDraft>(blankServer("smtp"))
  const [smtpSame, setSmtpSame] = useState(true)
  const [userTouched, setUserTouched] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [showServer, setShowServer] = useState(false)
  const [settings, setSettings] = useState<InboxSettingsDraft>(initialSettings)
  const [folders, setFolders] = useState<FolderPaths>(EMPTY_FOLDERS)
  const [access, setAccess] = useState<AccessValue>({ mode: "everyone", grants: [] })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [test, setTest] = useState<{ key: string; result: ConnectionTestResult } | null>(null)
  const testAction = useServerAction()
  const saveAction = useServerAction()

  const preset = options.presets.find((p) => p.id === presetId) ?? null
  const isCustom = presetId === "custom"
  const effectiveSmtp: ServerDraft = smtpSame ? { ...smtp, user: imap.user, pass: imap.pass } : smtp
  const credsKey = JSON.stringify([email, imap, effectiveSmtp])
  const testResult = test && test.key === credsKey ? test.result : null
  const imapOk = Boolean(testResult?.imap.ok)
  const stepIndex = steps.indexOf(step)

  const reset = () => {
    setStep("provider")
    setPresetId(null)
    setEmail("")
    setImap(blankServer("imap"))
    setSmtp(blankServer("smtp"))
    setSmtpSame(true)
    setUserTouched(false)
    setNameTouched(false)
    setShowServer(false)
    setSettings(initialSettings())
    setFolders(EMPTY_FOLDERS)
    setAccess({ mode: "everyone", grants: [] })
    setErrors({})
    setTest(null)
  }

  const choosePreset = (p: MailPreset) => {
    setPresetId(p.id)
    setImap((cur) => ({ ...cur, host: p.imap.host, port: p.imap.port, secure: p.imap.secure }))
    setSmtp((cur) => ({ ...cur, host: p.smtp.host, port: p.smtp.port, secure: p.smtp.secure }))
    setShowServer(p.id === "custom")
    // Gmail and Microsoft 365 store sent mail themselves
    setSettings((s) => ({ ...s, saveSentCopy: !(p.id === "gmail" || p.id === "outlook") }))
    setErrors({})
    setStep("credentials")
  }

  const onEmailChange = (value: string) => {
    const v = value.trim()
    setEmail(v)
    if (!userTouched) setImap((cur) => ({ ...cur, user: v }))
    if (!nameTouched) setSettings((s) => ({ ...s, name: v }))
  }

  const validateCredentials = () => {
    const e: Record<string, string> = {}
    if (!isEmail(email)) e["email"] = "Enter a valid email address"
    Object.assign(e, validateServerDraft("imap", imap, { requirePassword: true, requireUser: true }))
    Object.assign(
      e,
      validateServerDraft("smtp", effectiveSmtp, { requirePassword: !smtpSame, requireUser: !smtpSame })
    )
    setErrors(e)
    if (Object.keys(e).some((k) => k.endsWith(".host") || k.endsWith(".port"))) setShowServer(true)
    return Object.keys(e).length === 0
  }

  const runTest = () => {
    const key = credsKey
    return testAction.run(
      () =>
        testInboxConnection({
          slug: org.slug,
          scope,
          imap: { host: imap.host, port: Number(imap.port), secure: imap.secure, user: imap.user.trim(), pass: imap.pass },
          smtp: {
            host: effectiveSmtp.host,
            port: Number(effectiveSmtp.port),
            secure: effectiveSmtp.secure,
            user: effectiveSmtp.user.trim(),
            pass: effectiveSmtp.pass,
          },
        }),
      {
        onSuccess: (result) => {
          setTest({ key, result })
          if (result.imap.ok) setFolders(result.folders)
        },
        onError: (_err, fieldErrors) => {
          if (fieldErrors && Object.keys(fieldErrors).length) {
            setErrors(fieldErrors)
            setShowServer(true)
            setStep("credentials")
          }
        },
      }
    )
  }

  const goNext = () => {
    if (step === "credentials") {
      if (!validateCredentials()) return
      setStep("test")
      if (!testResult) void runTest()
      return
    }
    if (step === "test") {
      if (imapOk) setStep("settings")
      return
    }
    if (step === "settings") {
      if (!settings.name.trim()) {
        setErrors({ name: "Name is required" })
        return
      }
      setErrors({})
      if (scope === "shared") setStep("access")
      else void save()
      return
    }
    if (step === "access") void save()
  }

  const goBack = () => {
    setErrors({})
    const prev = steps[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const save = () => {
    const testToken = testResult?.token
    if (!testToken) {
      setStep("test")
      return
    }
    return saveAction.run(
      () =>
        connectInbox({
          slug: org.slug,
          scope,
          email,
          imap: { host: imap.host, port: Number(imap.port), secure: imap.secure, user: imap.user.trim(), pass: imap.pass },
          smtp: {
            host: effectiveSmtp.host,
            port: Number(effectiveSmtp.port),
            secure: effectiveSmtp.secure,
            user: effectiveSmtp.user.trim(),
            pass: effectiveSmtp.pass,
          },
          folders,
          settings: { ...settings, name: settings.name.trim(), fromName: settings.fromName.trim() },
          access: scope === "shared" ? access : undefined,
          testToken,
        }),
      {
        success: "Inbox connected — the first sync has started",
        onSuccess: () => {
          setOpen(false)
          reset()
        },
        onError: (_err, fieldErrors) => {
          if (!fieldErrors) return
          const keys = Object.keys(fieldErrors)
          const mapped: Record<string, string> = {}
          for (const k of keys) mapped[k.replace(/^settings\./, "")] = fieldErrors[k]!
          setErrors(mapped)
          if (keys.some((k) => k === "email" || k.startsWith("imap") || k.startsWith("smtp"))) setStep("credentials")
          else if (keys.some((k) => k.startsWith("settings"))) setStep("settings")
          else if (keys.some((k) => k.startsWith("access"))) setStep("access")
        },
      }
    )
  }

  const oauthHref = (provider: "google" | "microsoft") => {
    const params = new URLSearchParams({ purpose: "connect", org: org.slug, shared: scope === "shared" ? "1" : "0" })
    if (scope === "shared" && settings.teamId) params.set("teamId", settings.teamId)
    return `/api/oauth/${provider}/start?${params.toString()}`
  }

  const hasOAuth = options.oauth.google || options.oauth.microsoft
  const pending = testAction.pending || saveAction.pending
  const title = scope === "shared" ? "Connect a shared inbox" : "Connect your inbox"

  const primaryLabel = useMemo(() => {
    if (step === "credentials") return "Test connection"
    if (step === "settings" && scope === "personal") return "Connect inbox"
    if (step === "access") return "Connect inbox"
    return "Continue"
  }, [step, scope])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> Connect inbox
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[min(92dvh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none"
        onInteractOutside={(e) => {
          if (step !== "provider") e.preventDefault()
        }}
      >
        <DialogHeader className="safe-top gap-3 border-b px-5 pt-5 pb-4">
          <div className="pr-8">
            <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
            <DialogDescription className="mt-1">
              {scope === "shared"
                ? "Bring a team mailbox like support@ or sales@ into Dispatch. Mail stays on your server; Dispatch syncs it."
                : "Connect your own mailbox. Its conversations are private to you unless you share them."}
            </DialogDescription>
          </div>
          <ol className="flex items-center gap-1.5" aria-label="Progress">
            {steps.map((s, i) => {
              const done = i < stepIndex
              const current = i === stepIndex
              return (
                <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={current ? "step" : undefined}>
                  <span className={cn("h-1 rounded-full bg-muted transition-colors", (done || current) && "bg-brand", current && "bg-foreground")} />
                  <span
                    className={cn(
                      "truncate font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase max-sm:hidden",
                      current && "text-foreground"
                    )}
                  >
                    {done ? <Check className="mr-0.5 inline size-3 -translate-y-px" /> : null}
                    {STEP_LABELS[s]}
                  </span>
                </li>
              )
            })}
          </ol>
          <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase sm:hidden">
            Step {stepIndex + 1} of {steps.length} · {STEP_LABELS[step]}
          </span>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === "provider" && (
            <div className="flex flex-col gap-5">
              {hasOAuth && (
                <div className="flex flex-col gap-3">
                  <div>
                    <MicroLabel>Recommended</MicroLabel>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Sign in with your provider — no passwords stored, works with two-factor authentication.
                    </p>
                  </div>
                  {scope === "shared" && options.teams.length > 0 && (
                    <FormField label="Add to team" htmlFor="oauth-team" optional>
                      <Combobox
                        id="oauth-team"
                        options={options.teams.map((t) => ({ value: t.id, label: t.name, icon: <ColorDot color={t.color} /> }))}
                        value={settings.teamId}
                        onChange={(teamId) => setSettings((s) => ({ ...s, teamId }))}
                        placeholder="No team"
                        clearable
                      />
                    </FormField>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.oauth.google && (
                      <Button asChild variant="outline" size="lg" className="h-11 justify-start gap-3 px-4">
                        <a href={oauthHref("google")}>
                          <GoogleGlyph className="size-5" />
                          Continue with Google
                          <ArrowRight className="ml-auto text-muted-foreground" />
                        </a>
                      </Button>
                    )}
                    {options.oauth.microsoft && (
                      <Button asChild variant="outline" size="lg" className="h-11 justify-start gap-3 px-4">
                        <a href={oauthHref("microsoft")}>
                          <MicrosoftGlyph className="size-5" />
                          Continue with Microsoft
                          <ArrowRight className="ml-auto text-muted-foreground" />
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="relative my-1 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">or use IMAP &amp; SMTP</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}
              {!hasOAuth && (
                <p className="text-[13px] text-muted-foreground">
                  Choose your email provider. Dispatch connects over IMAP (incoming) and SMTP (outgoing).
                </p>
              )}
              <div role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {options.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="listitem"
                    onClick={() => choosePreset(p)}
                    className={cn(
                      "group flex flex-col items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      presetId === p.id && "border-foreground/30 ring-1 ring-foreground/10"
                    )}
                  >
                    <span className="flex size-8 items-center justify-center rounded-md border bg-background">{presetIcon(p.id)}</span>
                    <span className="text-[13px] leading-tight font-medium">{shortLabel(p)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "credentials" && (
            <div className="flex flex-col gap-5">
              {preset?.help && (
                <div className="flex gap-2.5 rounded-lg border bg-surface/60 px-3 py-2.5 text-[13px] text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" />
                  <p className="text-pretty">{preset.help}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Email address" htmlFor="connect-email" error={errors["email"]}>
                  <Input
                    id="connect-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    autoFocus
                    placeholder={scope === "shared" ? "support@example.com" : "you@example.com"}
                    value={email}
                    aria-invalid={Boolean(errors["email"]) || undefined}
                    onChange={(e) => onEmailChange(e.target.value)}
                  />
                </FormField>
                <FormField label="Sender name" htmlFor="connect-from" optional>
                  <Input
                    id="connect-from"
                    value={settings.fromName}
                    maxLength={120}
                    placeholder={options.defaultFromName || "e.g. Acme Support"}
                    onChange={(e) => setSettings((s) => ({ ...s, fromName: e.target.value }))}
                  />
                </FormField>
              </div>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <MicroLabel>Incoming mail · IMAP</MicroLabel>
                  {!isCustom && (
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{hostSummary(imap)}</span>
                  )}
                </div>
                <ServerFields
                  kind="imap"
                  value={imap}
                  onChange={(v) => {
                    if (v.user !== imap.user) setUserTouched(true)
                    setImap(v)
                  }}
                  errors={errors}
                  hideServer={!showServer}
                  passwordPlaceholder={presetId === "gmail" || presetId === "icloud" ? "App password" : undefined}
                />
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <MicroLabel>Outgoing mail · SMTP</MicroLabel>
                  {!showServer && <span className="truncate font-mono text-[11px] text-muted-foreground">{hostSummary(smtp)}</span>}
                </div>
                {showServer && <ServerFields kind="smtp" value={smtp} onChange={setSmtp} errors={errors} showCredentials={false} />}
                <SettingsRow
                  label="Use the same username and password as IMAP"
                  htmlFor="smtp-same"
                  className="rounded-lg border px-3 py-2.5 first:pt-2.5 last:pb-2.5"
                >
                  <Switch id="smtp-same" checked={smtpSame} onCheckedChange={setSmtpSame} />
                </SettingsRow>
                {!smtpSame && <ServerFields kind="smtp" value={smtp} onChange={setSmtp} errors={errors} hideServer />}
              </section>

              {!isCustom && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 w-fit text-muted-foreground"
                  aria-expanded={showServer}
                  onClick={() => setShowServer((v) => !v)}
                >
                  <ChevronDown className={cn("transition-transform", showServer && "rotate-180")} />
                  {showServer ? "Hide server settings" : "Edit server settings"}
                </Button>
              )}
              {options.blockPrivateNetworks && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> Connections to private networks are blocked on this server.
                </p>
              )}
            </div>
          )}

          {step === "test" && (
            <div className="flex flex-col gap-5">
              <ConnectionTestPanel
                running={testAction.pending}
                result={testResult}
                imapDetail={`${imap.host}:${imap.port}`}
                smtpDetail={`${effectiveSmtp.host}:${effectiveSmtp.port}`}
              />
              {testResult && !testResult.imap.ok && !testAction.pending && (
                <div className="flex gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[13px]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="text-pretty text-muted-foreground">
                    <p className="font-medium text-foreground">Dispatch couldn&apos;t sign in to the mailbox.</p>
                    <p className="mt-0.5">
                      Double-check the username and password — many providers require an app-specific password when two-factor
                      authentication is on — and that IMAP access is enabled for the mailbox.
                    </p>
                  </div>
                </div>
              )}
              {testResult?.imap.ok && !testResult.smtp.ok && !testAction.pending && (
                <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-pretty">
                    Incoming mail works, but sending failed. You can continue and fix the SMTP settings later — replies can&apos;t be sent
                    until then.
                  </p>
                </div>
              )}
              {testResult?.imap.ok && testResult.imap.mailboxes && (
                <section className="flex flex-col gap-3">
                  <div>
                    <MicroLabel>Folders</MicroLabel>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Found {testResult.imap.mailboxes.length} folder{testResult.imap.mailboxes.length === 1 ? "" : "s"}. We picked the
                      special folders automatically — adjust if needed.
                    </p>
                  </div>
                  <FolderFields value={folders} onChange={setFolders} mailboxes={testResult.imap.mailboxes} />
                </section>
              )}
            </div>
          )}

          {step === "settings" && (
            <div className="flex flex-col gap-6">
              <IdentityFields
                value={settings}
                onChange={(v) => {
                  if (v.name !== settings.name) setNameTouched(true)
                  setSettings(v)
                }}
                errors={errors}
                teams={options.teams}
                showTeam={scope === "shared"}
                fromNamePlaceholder={options.defaultFromName}
              />
              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-[13px] font-medium">Import history</div>
                  <p className="text-xs text-muted-foreground">How far back to import existing email. New mail always syncs.</p>
                </div>
                <SyncDaysField value={settings.syncDays} onChange={(syncDays) => setSettings((s) => ({ ...s, syncDays }))} />
              </div>
              <SendingFields value={settings} onChange={setSettings} errors={errors} />
            </div>
          )}

          {step === "access" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-sm font-medium">Who can work in this inbox?</div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">You can change this at any time in the inbox settings.</p>
              </div>
              <AccessEditor value={access} onChange={setAccess} teams={options.teams} members={options.members} />
            </div>
          )}
        </div>

        {step !== "provider" && (
          <div className="safe-bottom flex items-center justify-between gap-2 border-t bg-surface/60 px-5 py-3">
            <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex items-center gap-2">
              {step === "test" && (
                <Button type="button" variant="outline" onClick={() => void runTest()} disabled={pending}>
                  <RefreshCw className={cn(testAction.pending && "animate-spin")} />
                  {testResult ? "Test again" : "Run test"}
                </Button>
              )}
              <Button
                type="button"
                onClick={goNext}
                disabled={pending || (step === "test" && !imapOk)}
              >
                {(saveAction.pending || (step === "credentials" && testAction.pending)) && <Loader2 className="animate-spin" />}
                {primaryLabel}
                {primaryLabel === "Continue" && <ArrowRight />}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
