/**
 * Serializable shapes shared between the inbox settings pages (server) and
 * their client components. No secrets ever appear in these types.
 */

export type InboxScope = "shared" | "personal"
export type InboxProvider = "imap" | "gmail" | "outlook" | "demo"
export type InboxStatus = "pending" | "syncing" | "active" | "error" | "paused"
export type AccessLevel = "read" | "reply" | "manage"
export type SyncDays = 7 | 30 | 90 | 365

export const SYNC_DAY_OPTIONS: SyncDays[] = [7, 30, 90, 365]

export type MailPreset = {
  id: string
  label: string
  imap: { host: string; port: number; secure: boolean }
  smtp: { host: string; port: number; secure: boolean }
  help?: string
}

export type AccessGrant = { kind: "team" | "user"; id: string; level: AccessLevel }
export type AccessValue = { mode: "everyone" | "specific"; grants: AccessGrant[] }

export type TeamOpt = { id: string; name: string; color: string }
export type MemberOpt = { userId: string; name: string | null; email: string; avatarUrl: string | null }
export type SignatureOpt = { id: string; name: string; personal: boolean }

export type FolderPaths = { sentPath: string; archivePath: string; trashPath: string; spamPath: string }

export type Mailbox = { path: string; name: string; specialUse?: string }

export type ServerSettings = { host: string; port: number; secure: boolean; user: string }

export type ConnectionTestResult = {
  imap: { ok: true; mailboxes: Mailbox[] } | { ok: false; error: string }
  smtp: { ok: true } | { ok: false; error: string }
  /** Folder paths suggested from IMAP special-use flags */
  folders: FolderPaths
  /** Proof of a successful IMAP test for exactly these credentials (required to save) */
  token?: string
}

export type ConnectOptions = {
  scope: InboxScope
  presets: MailPreset[]
  oauth: { google: boolean; microsoft: boolean }
  teams: TeamOpt[]
  members: MemberOpt[]
  blockPrivateNetworks: boolean
  defaultFromName: string
}

export type InboxListItem = {
  id: string
  name: string
  email: string
  color: string
  provider: InboxProvider
  status: InboxStatus
  lastError: string | null
  lastSyncedAt: Date | null
  createdAt: Date
  team: TeamOpt | null
  access: { teams: number; users: number }
  conversationCount: number
}

export type InboxDetail = InboxListItem & {
  scope: InboxScope
  fromName: string | null
  aliases: string[]
  signatureId: string | null
  config: {
    syncDays: number
    markReadOnServer: boolean
    saveSentCopy: boolean
    autoCc: string[]
    autoBcc: string[]
    inboxPath: string
  } & FolderPaths
  connection: {
    imap: ServerSettings | null
    smtp: ServerSettings | null
    hasPassword: boolean
    oauth: { provider: "google" | "microsoft" } | null
  }
  accessValue: AccessValue
}
