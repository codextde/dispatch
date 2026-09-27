import "server-only"
import { encryptJson, decryptJson } from "@/server/crypto"

/**
 * Credentials of a connected mailbox, stored encrypted in
 * `accounts.credentials_enc`. Never sent to the client.
 */
export type ImapCredentials = {
  host: string
  port: number
  secure: boolean
  user: string
  pass?: string
}

export type SmtpCredentials = {
  host: string
  port: number
  secure: boolean
  user: string
  pass?: string
}

export type OAuthCredentials = {
  provider: "google" | "microsoft"
  accessToken: string
  refreshToken?: string
  expiresAt?: number // epoch ms
  scope?: string
}

export type AccountCredentials = {
  imap?: ImapCredentials
  smtp?: SmtpCredentials
  oauth?: OAuthCredentials
}

export function encryptCredentials(c: AccountCredentials): string {
  return encryptJson(c)
}

export function decryptCredentials(payload: string | null | undefined): AccountCredentials {
  return decryptJson<AccountCredentials>(payload) ?? {}
}

/** Well-known provider presets for the "Connect inbox" form. */
export const MAIL_PRESETS: Record<
  string,
  { label: string; imap: { host: string; port: number; secure: boolean }; smtp: { host: string; port: number; secure: boolean }; help?: string }
> = {
  gmail: {
    label: "Gmail / Google Workspace (app password)",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    help: "Enable 2-Step Verification and create an App Password at myaccount.google.com/apppasswords — or use Sign in with Google when configured.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    help: "Microsoft 365 requires OAuth for most tenants — use Sign in with Microsoft when configured.",
  },
  icloud: {
    label: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    help: "Create an app-specific password at appleid.apple.com.",
  },
  fastmail: {
    label: "Fastmail",
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
  },
  zoho: {
    label: "Zoho Mail",
    imap: { host: "imap.zoho.eu", port: 993, secure: true },
    smtp: { host: "smtp.zoho.eu", port: 465, secure: true },
  },
  ionos: {
    label: "IONOS",
    imap: { host: "imap.ionos.de", port: 993, secure: true },
    smtp: { host: "smtp.ionos.de", port: 465, secure: true },
  },
  yahoo: {
    label: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
  },
  custom: {
    label: "Other (IMAP/SMTP)",
    imap: { host: "", port: 993, secure: true },
    smtp: { host: "", port: 465, secure: true },
  },
}
