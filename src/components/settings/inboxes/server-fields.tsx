"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { FormField } from "@/components/settings/settings-ui"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type ServerDraft = { host: string; port: number | ""; secure: boolean; user: string; pass: string }

const DEFAULT_PORTS = {
  imap: { secure: 993, starttls: 143 },
  smtp: { secure: 465, starttls: 587 },
} as const

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  autoComplete = "new-password",
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  invalid?: boolean
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        spellCheck={false}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/**
 * Host / port / security (+ optional username & password) for IMAP or SMTP.
 * `errors` uses dotted keys from the server, e.g. "imap.host".
 */
export function ServerFields({
  kind,
  value,
  onChange,
  errors = {},
  showCredentials = true,
  hideServer = false,
  passwordPlaceholder,
  passwordOptional,
}: {
  kind: "imap" | "smtp"
  value: ServerDraft
  onChange: (value: ServerDraft) => void
  errors?: Record<string, string>
  showCredentials?: boolean
  /** Only render username & password (server settings come from a preset) */
  hideServer?: boolean
  passwordPlaceholder?: string
  passwordOptional?: boolean
}) {
  const id = (f: string) => `${kind}-${f}`
  const err = (f: string) => errors[`${kind}.${f}`]
  const set = (patch: Partial<ServerDraft>) => onChange({ ...value, ...patch })

  const setSecure = (secure: boolean) => {
    const ports = DEFAULT_PORTS[kind]
    const isDefault = value.port === "" || value.port === ports.secure || value.port === ports.starttls
    set({ secure, port: isDefault ? (secure ? ports.secure : ports.starttls) : value.port })
  }

  const credentials = showCredentials && (
    <div className={hideServer ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:col-span-3 sm:grid-cols-2"}>
      <FormField label="Username" htmlFor={id("user")} error={err("user")}>
        <Input
          id={id("user")}
          value={value.user}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(err("user")) || undefined}
          onChange={(e) => set({ user: e.target.value })}
        />
      </FormField>
      <FormField label="Password" htmlFor={id("pass")} error={err("pass")} optional={passwordOptional}>
        <PasswordInput
          id={id("pass")}
          value={value.pass}
          placeholder={passwordPlaceholder}
          invalid={Boolean(err("pass"))}
          onChange={(pass) => set({ pass })}
        />
      </FormField>
    </div>
  )

  if (hideServer) return credentials || null

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_8.5rem]">
      <FormField label={kind === "imap" ? "IMAP server" : "SMTP server"} htmlFor={id("host")} error={err("host")}>
        <Input
          id={id("host")}
          value={value.host}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          placeholder={kind === "imap" ? "imap.example.com" : "smtp.example.com"}
          aria-invalid={Boolean(err("host")) || undefined}
          onChange={(e) => set({ host: e.target.value.trim() })}
        />
      </FormField>
      <FormField label="Port" htmlFor={id("port")} error={err("port")}>
        <Input
          id={id("port")}
          value={value.port}
          inputMode="numeric"
          aria-invalid={Boolean(err("port")) || undefined}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 5)
            set({ port: digits === "" ? "" : Number(digits) })
          }}
        />
      </FormField>
      <FormField label="Security" htmlFor={id("secure")}>
        <Select value={value.secure ? "tls" : "starttls"} onValueChange={(v) => setSecure(v === "tls")}>
          <SelectTrigger id={id("secure")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tls">SSL/TLS</SelectItem>
            <SelectItem value="starttls">STARTTLS</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      {credentials}
    </div>
  )
}

/** Client-side checks mirroring the server schema (server remains authoritative). */
export function validateServerDraft(
  kind: "imap" | "smtp",
  v: ServerDraft,
  opts: { requirePassword: boolean; requireUser: boolean }
): Record<string, string> {
  const e: Record<string, string> = {}
  const host = v.host.trim()
  if (!host) e[`${kind}.host`] = "Host is required"
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) e[`${kind}.host`] = "Enter only the host name, without imap:// or https://"
  else if (!/^[a-z0-9.\-:[\]]+$/i.test(host)) e[`${kind}.host`] = "Enter a valid host name"
  if (v.port === "" || v.port < 1 || v.port > 65535) e[`${kind}.port`] = "Port must be 1–65535"
  if (opts.requireUser && !v.user.trim()) e[`${kind}.user`] = "Username is required"
  if (opts.requirePassword && !v.pass) e[`${kind}.pass`] = "Password is required"
  return e
}
