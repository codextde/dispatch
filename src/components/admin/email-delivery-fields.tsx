"use client"

import { useState } from "react"
import { CheckCircle2, Cloud, Server, Send, Terminal, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChoiceCards } from "@/components/admin/choice-cards"
import { SecretInput } from "@/components/admin/secret-input"
import { testEmailAction } from "@/app/admin/settings/actions"
import { cn } from "@/lib/utils"

export type EmailDeliveryValue = {
  provider: "log" | "smtp" | "ses"
  host: string
  port: number
  secure: boolean
  user: string
  sesRegion: string
  fromName: string
  fromEmail: string
  replyTo: string
}

export const SES_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-central-2", label: "Europe (Zurich)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "eu-south-1", label: "Europe (Milan)" },
  { value: "il-central-1", label: "Israel (Tel Aviv)" },
  { value: "me-south-1", label: "Middle East (Bahrain)" },
  { value: "af-south-1", label: "Africa (Cape Town)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-southeast-3", label: "Asia Pacific (Jakarta)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
] as const

function FieldRow({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Provider picker + connection fields for system email delivery. Shared by the
 * setup wizard and Admin → Settings → Email delivery.
 */
export function EmailDeliveryFields({
  value,
  onChange,
  passwordPreview,
  password,
  onPasswordChange,
  showReplyTo = true,
  defaultFromEmail,
  fieldErrors,
}: {
  value: EmailDeliveryValue
  onChange: (patch: Partial<EmailDeliveryValue>) => void
  passwordPreview: string
  password: string | undefined
  onPasswordChange: (value: string | undefined) => void
  showReplyTo?: boolean
  /** Shown as placeholder, e.g. no-reply@mail.example.com */
  defaultFromEmail?: string
  fieldErrors?: Record<string, string>
}) {
  const err = (k: string) => fieldErrors?.[k] ?? fieldErrors?.[`values.${k}`] ?? fieldErrors?.[`config.${k}`]
  return (
    <div className="grid gap-5">
      <ChoiceCards
        aria-label="Email provider"
        columns={3}
        value={value.provider}
        onChange={(provider) =>
          onChange(
            provider === "ses"
              ? { provider, port: value.port === 465 ? 465 : 587, secure: value.port === 465 }
              : { provider }
          )
        }
        options={[
          { value: "ses", title: "Amazon SES", description: "Reliable, low-cost delivery via the SES SMTP interface.", icon: Cloud },
          { value: "smtp", title: "SMTP server", description: "Postmark, Mailgun, Resend, Brevo or your own server.", icon: Server },
          { value: "log", title: "Log only", description: "Print emails to the server logs. Fine for trying things out.", icon: Terminal },
        ]}
      />

      {value.provider === "log" && (
        <div className="rounded-lg border border-dashed border-border bg-surface/60 p-4 text-[13px] leading-relaxed text-muted-foreground">
          Emails are not delivered. Sign-in links, codes and invitations are printed to the server output — view them with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">docker compose logs -f app</code>. Anyone
          who needs to sign in will need you to relay their code, so configure a provider before inviting your team.
        </div>
      )}

      {value.provider === "ses" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="AWS region" htmlFor="email-ses-region" hint="The region where your SES identity is verified.">
            <Select value={value.sesRegion} onValueChange={(sesRegion) => onChange({ sesRegion })}>
              <SelectTrigger id="email-ses-region" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SES_REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label} <span className="font-mono text-xs text-muted-foreground">{r.value}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Port" htmlFor="email-ses-port" hint="587 uses STARTTLS, 465 uses implicit TLS.">
            <Select
              value={String(value.port === 465 ? 465 : value.port === 2587 ? 2587 : 587)}
              onValueChange={(p) => onChange({ port: Number(p), secure: p === "465" })}
            >
              <SelectTrigger id="email-ses-port" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="587">587 · STARTTLS</SelectItem>
                <SelectItem value="2587">2587 · STARTTLS</SelectItem>
                <SelectItem value="465">465 · TLS</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow
            label="SMTP username"
            htmlFor="email-user"
            hint={
              <>
                Create SMTP credentials in the SES console → <em>SMTP settings</em>. These are not your AWS access keys.
              </>
            }
          >
            <Input
              id="email-user"
              value={value.user}
              onChange={(e) => onChange({ user: e.target.value })}
              placeholder="AKIA…"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[13px]"
              aria-invalid={Boolean(err("user"))}
            />
          </FieldRow>
          <FieldRow label="SMTP password" htmlFor="email-password">
            <SecretInput id="email-password" preview={passwordPreview} value={password} onChange={onPasswordChange} />
          </FieldRow>
        </div>
      )}

      {value.provider === "smtp" && (
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_170px]">
          <FieldRow label="Host" htmlFor="email-host">
            <Input
              id="email-host"
              value={value.host}
              onChange={(e) => onChange({ host: e.target.value })}
              placeholder="smtp.postmarkapp.com"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(err("host"))}
            />
          </FieldRow>
          <FieldRow label="Port" htmlFor="email-port">
            <Input
              id="email-port"
              inputMode="numeric"
              value={String(value.port)}
              onChange={(e) => {
                const port = Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0
                onChange({ port, ...(port === 465 ? { secure: true } : port === 587 || port === 25 ? { secure: false } : {}) })
              }}
              aria-invalid={Boolean(err("port"))}
            />
          </FieldRow>
          <FieldRow label="Security" htmlFor="email-security">
            <Select value={value.secure ? "tls" : "starttls"} onValueChange={(v) => onChange({ secure: v === "tls" })}>
              <SelectTrigger id="email-security" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS</SelectItem>
                <SelectItem value="tls">SSL / TLS</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Username" htmlFor="email-user" className="sm:col-span-1">
            <Input
              id="email-user"
              value={value.user}
              onChange={(e) => onChange({ user: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(err("user"))}
            />
          </FieldRow>
          <FieldRow label="Password" htmlFor="email-password" className="sm:col-span-2">
            <SecretInput id="email-password" preview={passwordPreview} value={password} onChange={onPasswordChange} />
          </FieldRow>
        </div>
      )}

      {value.provider !== "log" && (
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <FieldRow label="From name" htmlFor="email-from-name">
            <Input
              id="email-from-name"
              value={value.fromName}
              onChange={(e) => onChange({ fromName: e.target.value })}
              placeholder="Dispatch"
            />
          </FieldRow>
          <FieldRow
            label="From email"
            htmlFor="email-from-email"
            hint={value.provider === "ses" ? "Must be a verified identity in SES." : "Use an address your provider may send from."}
          >
            <Input
              id="email-from-email"
              type="email"
              value={value.fromEmail}
              onChange={(e) => onChange({ fromEmail: e.target.value })}
              placeholder={defaultFromEmail ?? "no-reply@example.com"}
              aria-invalid={Boolean(err("fromEmail"))}
            />
          </FieldRow>
          {showReplyTo && (
            <FieldRow label="Reply-to (optional)" htmlFor="email-reply-to" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <Input
                id="email-reply-to"
                type="email"
                value={value.replyTo}
                onChange={(e) => onChange({ replyTo: e.target.value })}
                placeholder="support@example.com"
                aria-invalid={Boolean(err("replyTo"))}
              />
            </FieldRow>
          )}
        </div>
      )}
    </div>
  )
}

/** "Send test email" row: sends with the current (unsaved) form values. */
export function TestEmailPanel({
  config,
  password,
  defaultTo,
  className,
}: {
  config: EmailDeliveryValue
  password: string | undefined
  defaultTo: string
  className?: string
}) {
  const [to, setTo] = useState(defaultTo)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function send() {
    setPending(true)
    setResult(null)
    try {
      const res = await testEmailAction({ config, password, to })
      setResult(res.ok ? { ok: true, message: res.data.message } : { ok: false, message: res.error })
    } catch {
      setResult({ ok: false, message: "Could not reach the server." })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn("rounded-lg border border-border bg-surface/60 p-3.5", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Label htmlFor="test-email-to" className="shrink-0 text-[13px] sm:w-28">
          Send a test to
        </Label>
        <Input
          id="test-email-to"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="min-w-0 flex-1 bg-card"
        />
        <Button type="button" variant="outline" onClick={send} disabled={pending || !to}>
          {pending ? <Spinner /> : <Send />} Send test email
        </Button>
      </div>
      {result && (
        <p
          role="status"
          className={cn(
            "mt-2.5 flex items-start gap-1.5 text-[13px]",
            result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
          )}
        >
          {result.ok ? <CheckCircle2 className="mt-px size-4 shrink-0" /> : <XCircle className="mt-px size-4 shrink-0" />}
          <span className="min-w-0 break-words">{result.message}</span>
        </p>
      )}
    </div>
  )
}
