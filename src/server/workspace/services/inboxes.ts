import "server-only"
import net from "node:net"
import { z } from "zod"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import { assertPermission, type OrgContext } from "@/server/authz"
import { hmac, sign, unsign } from "@/server/crypto"
import { enqueueJob } from "@/server/jobs"
import { getSettings } from "@/server/settings"
import { rateLimit } from "@/server/rate-limit"
import {
  decryptCredentials,
  encryptCredentials,
  type AccountCredentials,
  type ImapCredentials,
  type SmtpCredentials,
} from "@/server/mail/credentials"
import { assertHostAllowed, BlockedHostError } from "@/server/mail/net-guard"
import { fail } from "@/server/workspace/context"
import { attachmentKeysForConversations, deleteCommentAttachmentRows } from "@/server/workspace/storage-cleanup"
import { filterMemberIds, filterOrgIds } from "@/server/workspace/queries/common"
import type {
  AccessGrant,
  AccessValue,
  ConnectionTestResult,
  FolderPaths,
  InboxScope,
  Mailbox,
} from "@/components/settings/inboxes/types"

/**
 * Inbox (email account) management: validation, connection tests, create /
 * update / delete. Server actions in `actions/inboxes.ts` are thin wrappers
 * around these functions so the logic can be exercised from scripts.
 *
 * Scope rules:
 *  - shared inboxes (ownerUserId IS NULL) require `inboxes.manage`
 *  - personal inboxes require `inboxes.connect_personal` and ownership
 */

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">
type AccountRow = typeof schema.accounts.$inferSelect

/* ------------------------------- Validation ------------------------------- */

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i

export const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Host is required")
  .max(253, "Host is too long")
  .refine((h) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(h), "Enter only the host name, without imap:// or https://")
  .refine((h) => HOSTNAME_RE.test(h) || net.isIP(h.replace(/^\[|\]$/g, "")) !== 0, "Enter a valid host name")

const portSchema = z.number({ error: "Enter a port" }).int("Enter a whole number").min(1, "Port must be 1–65535").max(65535, "Port must be 1–65535")

export const serverSchema = z.object({
  host: hostSchema,
  port: portSchema,
  secure: z.boolean(),
  user: z.string().trim().min(1, "Username is required").max(320),
  pass: z.string().max(1024).optional(),
})

const emailList = z
  .array(z.email("Invalid email address").trim().toLowerCase())
  .max(50)
  .transform((a) => [...new Set(a)])

const folderPath = z.string().trim().max(500).optional().default("")

export const folderSchema = z.object({
  sentPath: folderPath,
  archivePath: folderPath,
  trashPath: folderPath,
  spamPath: folderPath,
})

export const accessSchema = z.object({
  mode: z.enum(["everyone", "specific"]),
  grants: z
    .array(z.object({ kind: z.enum(["team", "user"]), id: z.uuid(), level: z.enum(["read", "reply", "manage"]) }))
    .max(500),
})

export const inboxSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a color"),
  teamId: z.uuid().nullable().optional(),
  fromName: z.string().trim().max(120).optional().default(""),
  syncDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  aliases: emailList,
  autoCc: emailList,
  autoBcc: emailList,
  saveSentCopy: z.boolean(),
  markReadOnServer: z.boolean(),
})

export const scopeSchema = z.enum(["shared", "personal"])

export const connectSchema = z.object({
  slug: z.string(),
  scope: scopeSchema,
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  imap: serverSchema.extend({ pass: z.string().min(1, "Password is required").max(1024) }),
  smtp: serverSchema.extend({ pass: z.string().min(1, "Password is required").max(1024) }),
  folders: folderSchema,
  settings: inboxSettingsSchema,
  access: accessSchema.optional(),
  testToken: z.string().min(1, "Test the connection before saving"),
})
export type ConnectInput = z.infer<typeof connectSchema>

export const testSchema = z.object({
  slug: z.string(),
  scope: scopeSchema,
  imap: serverSchema.extend({ pass: z.string().min(1, "Password is required").max(1024) }),
  smtp: serverSchema.extend({ pass: z.string().min(1, "Password is required").max(1024) }),
})
export type TestInput = z.infer<typeof testSchema>

/* ------------------------------ Scope helpers ----------------------------- */

export function permissionFor(scope: InboxScope) {
  return scope === "shared" ? ("inboxes.manage" as const) : ("inboxes.connect_personal" as const)
}

/** Load an account the member may manage in the given scope (404-style error otherwise). */
export async function getManagedAccount(ctx: Ctx, id: string, scope: InboxScope, tx: DbOrTx = db): Promise<AccountRow> {
  assertPermission(ctx, permissionFor(scope))
  const a = schema.accounts
  const [row] = await tx
    .select()
    .from(a)
    .where(
      and(
        eq(a.id, id),
        eq(a.orgId, ctx.org.id),
        scope === "shared" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)
      )
    )
    .limit(1)
  if (!row) fail("Inbox not found", 404)
  return row
}

/** Enforce the instance "block private networks" policy for a mail host. */
export async function assertMailHostAllowed(host: string) {
  const security = await getSettings("security")
  if (!security.blockPrivateNetworks) return
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase()
  if (bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local") || bare.endsWith(".internal")) {
    fail(`Connections to internal hosts are not allowed (${host}).`)
  }
  try {
    await assertHostAllowed(bare)
  } catch (err) {
    if (err instanceof BlockedHostError) fail(err.message)
    fail(`Couldn't resolve ${host}. Check the host name.`)
  }
}

/* ---------------------------- Connection tests ---------------------------- */

const TEST_TOKEN_TTL_MS = 30 * 60_000

function credentialFingerprint(imap: ImapCredentials) {
  return hmac(JSON.stringify([imap.host.toLowerCase(), imap.port, imap.secure, imap.user, imap.pass ?? ""]), "inbox-test")
}

/** Signed proof that `imap` passed a connection test for this member & workspace. */
export function issueTestToken(ctx: Ctx, imap: ImapCredentials) {
  const expires = Date.now() + TEST_TOKEN_TTL_MS
  return sign(`${ctx.org.id}:${ctx.user.id}:${expires}:${credentialFingerprint(imap)}`, "inbox-test")
}

export function verifyTestToken(ctx: Ctx, imap: ImapCredentials, token: string) {
  const value = unsign(token, "inbox-test")
  if (!value) return false
  const [orgId, userId, expires, fp] = value.split(":")
  return (
    orgId === ctx.org.id &&
    userId === ctx.user.id &&
    Number(expires) > Date.now() &&
    fp === credentialFingerprint(imap)
  )
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

const SPECIAL_USE: Record<keyof FolderPaths, { flags: string[]; names: RegExp }> = {
  sentPath: { flags: ["\\Sent"], names: /^(sent|sent items|sent mail|sent messages|gesendet|gesendete (objekte|elemente))$/i },
  archivePath: { flags: ["\\Archive", "\\All"], names: /^(archive|archives|all mail|archiv)$/i },
  trashPath: { flags: ["\\Trash"], names: /^(trash|deleted|deleted items|deleted messages|bin|papierkorb|gelöschte (objekte|elemente))$/i },
  spamPath: { flags: ["\\Junk"], names: /^(spam|junk|junk e-mail|junk email|bulk mail)$/i },
}

/** Pick Sent/Archive/Trash/Spam paths from IMAP special-use flags, falling back to common names. */
export function suggestFolders(mailboxes: Mailbox[]): FolderPaths {
  const pick = (key: keyof FolderPaths) => {
    const { flags, names } = SPECIAL_USE[key]
    for (const flag of flags) {
      const hit = mailboxes.find((m) => m.specialUse?.toLowerCase() === flag.toLowerCase())
      if (hit) return hit.path
    }
    return mailboxes.find((m) => names.test(m.name) || names.test(m.path.split(/[/.]/).pop() ?? ""))?.path ?? ""
  }
  return { sentPath: pick("sentPath"), archivePath: pick("archivePath"), trashPath: pick("trashPath"), spamPath: pick("spamPath") }
}

/**
 * Test IMAP and SMTP in parallel (mail-engine's connection module). A
 * successful IMAP test returns a short-lived token that `createInbox`
 * requires, so accounts are only saved with verified credentials.
 */
export async function runConnectionTest(
  ctx: Ctx,
  imap: ImapCredentials,
  smtp: SmtpCredentials
): Promise<ConnectionTestResult> {
  const limit = await rateLimit(`inbox-test:${ctx.user.id}`, 30, 15 * 60)
  if (!limit.ok) fail("Too many connection tests. Please wait a few minutes and try again.", 429)
  await Promise.all([assertMailHostAllowed(imap.host), assertMailHostAllowed(smtp.host)])

  const { testImap, testSmtp } = await import("@/server/mail/connection")
  const [imapRes, smtpRes] = await Promise.all([
    withTimeout(testImap(imap), 45_000, "IMAP connection").catch((err) => ({ ok: false as const, error: errorMessage(err) })),
    withTimeout(testSmtp(smtp), 45_000, "SMTP connection").catch((err) => ({ ok: false as const, error: errorMessage(err) })),
  ])

  const mailboxes: Mailbox[] = imapRes.ok
    ? imapRes.mailboxes.map((m) => ({ path: m.path, name: m.name, specialUse: m.specialUse ?? undefined }))
    : []
  return {
    imap: imapRes.ok ? { ok: true, mailboxes } : { ok: false, error: imapRes.error || "IMAP connection failed" },
    smtp: smtpRes.ok ? { ok: true } : { ok: false, error: smtpRes.error || "SMTP connection failed" },
    folders: suggestFolders(mailboxes),
    token: imapRes.ok ? issueTestToken(ctx, imap) : undefined,
  }
}

/** Re-test an existing account with its stored (decrypted server-side) credentials. */
export async function retestAccount(ctx: Ctx, account: AccountRow): Promise<ConnectionTestResult> {
  if (account.provider !== "imap") fail("Connection tests are only available for IMAP inboxes.")
  const creds = decryptCredentials(account.credentialsEnc)
  if (!creds.imap || !creds.smtp) fail("This inbox has no stored IMAP/SMTP credentials. Update the credentials first.")
  const result = await runConnectionTest(ctx, creds.imap, creds.smtp)
  return { ...result, token: undefined }
}

/* --------------------------------- Access --------------------------------- */

/** Validate grants against the org and dedupe them (last level wins). */
export async function normalizeGrants(orgId: string, access: AccessValue | undefined): Promise<AccessGrant[]> {
  if (!access || access.mode === "everyone") return []
  const map = new Map<string, AccessGrant>()
  for (const g of access.grants) map.set(`${g.kind}:${g.id}`, g)
  const grants = [...map.values()]
  const [teamIds, userIds] = await Promise.all([
    filterOrgIds("teams", orgId, grants.filter((g) => g.kind === "team").map((g) => g.id)),
    filterMemberIds(orgId, grants.filter((g) => g.kind === "user").map((g) => g.id), true),
  ])
  const valid = new Set([...teamIds.map((id) => `team:${id}`), ...userIds.map((id) => `user:${id}`)])
  const invalid = grants.filter((g) => !valid.has(`${g.kind}:${g.id}`))
  if (invalid.length) fail("Some teams or people in the access list no longer exist. Refresh and try again.")
  if (access.mode === "specific" && grants.length === 0) fail("Add at least one team or person, or share with everyone.")
  return grants
}

async function writeGrants(tx: DbOrTx, accountId: string, grants: AccessGrant[]) {
  await tx.delete(schema.accountAccess).where(eq(schema.accountAccess.accountId, accountId))
  if (!grants.length) return
  await tx.insert(schema.accountAccess).values(
    grants.map((g) => ({
      accountId,
      teamId: g.kind === "team" ? g.id : null,
      userId: g.kind === "user" ? g.id : null,
      level: g.level,
    }))
  )
}

/* --------------------------------- Create --------------------------------- */

function syncFromDate(days: number) {
  return new Date(Date.now() - days * 86_400_000)
}

async function resolveTeamId(orgId: string, teamId: string | null | undefined, scope: InboxScope) {
  if (!teamId || scope === "personal") return null
  const [valid] = await filterOrgIds("teams", orgId, [teamId])
  if (!valid) fail("That team no longer exists.")
  return valid
}

export async function createInbox(ctx: Ctx, input: Omit<ConnectInput, "slug">): Promise<{ id: string }> {
  const scope = input.scope
  assertPermission(ctx, permissionFor(scope))
  const imap: ImapCredentials = { ...input.imap, host: input.imap.host.toLowerCase() }
  const smtp: SmtpCredentials = { ...input.smtp, host: input.smtp.host.toLowerCase() }
  if (!verifyTestToken(ctx, imap, input.testToken)) {
    fail("The connection test expired or the credentials changed. Test the connection again before saving.")
  }
  await Promise.all([assertMailHostAllowed(imap.host), assertMailHostAllowed(smtp.host)])

  const a = schema.accounts
  const [dup] = await db
    .select({ id: a.id })
    .from(a)
    .where(
      and(
        eq(a.orgId, ctx.org.id),
        sql`lower(${a.email}) = ${input.email}`,
        scope === "shared" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)
      )
    )
    .limit(1)
  if (dup) fail(scope === "shared" ? "This mailbox is already connected as a shared inbox." : "You already connected this mailbox.")

  const teamId = await resolveTeamId(ctx.org.id, input.settings.teamId, scope)
  const grants = scope === "shared" ? await normalizeGrants(ctx.org.id, input.access) : []
  const s = input.settings
  const creds: AccountCredentials = { imap, smtp }

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(a)
      .values({
        orgId: ctx.org.id,
        ownerUserId: scope === "personal" ? ctx.user.id : null,
        teamId,
        provider: "imap",
        name: s.name,
        email: input.email,
        fromName: s.fromName || null,
        aliases: s.aliases.filter((x) => x !== input.email),
        color: s.color.toLowerCase(),
        credentialsEnc: encryptCredentials(creds),
        config: {
          imapHost: imap.host,
          imapPort: imap.port,
          imapSecure: imap.secure,
          smtpHost: smtp.host,
          smtpPort: smtp.port,
          smtpSecure: smtp.secure,
          username: imap.user,
          inboxPath: "INBOX",
          sentPath: input.folders.sentPath || undefined,
          archivePath: input.folders.archivePath || undefined,
          trashPath: input.folders.trashPath || undefined,
          spamPath: input.folders.spamPath || undefined,
          syncDays: s.syncDays,
          markReadOnServer: s.markReadOnServer,
          saveSentCopy: s.saveSentCopy,
          autoCc: s.autoCc,
          autoBcc: s.autoBcc,
        },
        status: "pending",
        syncFromDate: syncFromDate(s.syncDays),
      })
      .returning({ id: a.id })
    await writeGrants(tx, row!.id, grants)
    return row!.id
  })
  await enqueueJob("account.sync", { accountId: id })
  return { id }
}

/* --------------------------------- Update --------------------------------- */

export const updateSettingsSchema = inboxSettingsSchema.extend({
  folders: folderSchema,
  signatureId: z.uuid().nullable(),
})
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

export async function updateInboxSettings(ctx: Ctx, id: string, scope: InboxScope, input: UpdateSettingsInput) {
  const account = await getManagedAccount(ctx, id, scope)
  const teamId = await resolveTeamId(ctx.org.id, input.teamId, scope)

  let signatureId: string | null = null
  if (input.signatureId) {
    const sg = schema.signatures
    const [sig] = await db
      .select({ id: sg.id })
      .from(sg)
      .where(
        and(
          eq(sg.id, input.signatureId),
          eq(sg.orgId, ctx.org.id),
          scope === "shared" ? isNull(sg.ownerUserId) : sql`(${sg.ownerUserId} is null or ${sg.ownerUserId} = ${ctx.user.id})`
        )
      )
      .limit(1)
    if (!sig) fail("That signature no longer exists.")
    signatureId = sig.id
  }

  const prevDays = account.config.syncDays ?? 30
  const syncDaysChanged = prevDays !== input.syncDays
  const config = {
    ...account.config,
    sentPath: input.folders.sentPath || undefined,
    archivePath: input.folders.archivePath || undefined,
    trashPath: input.folders.trashPath || undefined,
    spamPath: input.folders.spamPath || undefined,
    syncDays: input.syncDays,
    markReadOnServer: input.markReadOnServer,
    saveSentCopy: input.saveSentCopy,
    autoCc: input.autoCc,
    autoBcc: input.autoBcc,
  }
  await db
    .update(schema.accounts)
    .set({
      name: input.name,
      color: input.color.toLowerCase(),
      teamId,
      fromName: input.fromName || null,
      aliases: input.aliases.filter((x) => x !== account.email.toLowerCase()),
      signatureId,
      config,
      ...(syncDaysChanged ? { syncFromDate: syncFromDate(input.syncDays) } : {}),
    })
    .where(and(eq(schema.accounts.id, account.id), eq(schema.accounts.orgId, ctx.org.id)))
  // The worker restarts the connection with the new config (folders, aliases, sync window …)
  if (account.status !== "paused") await enqueueJob("account.sync", { accountId: account.id })
  return { account, syncDaysChanged }
}

export async function updateInboxAccess(ctx: Ctx, id: string, access: AccessValue) {
  const account = await getManagedAccount(ctx, id, "shared")
  const grants = await normalizeGrants(ctx.org.id, access)
  await db.transaction((tx) => writeGrants(tx, account.id, grants))
  return { account, grants }
}

export const credentialsSchema = z.object({
  imap: serverSchema,
  smtp: serverSchema,
  /** Use the IMAP username & password for SMTP too */
  smtpSameAsImap: z.boolean(),
})
export type CredentialsInput = z.infer<typeof credentialsSchema>

/** Same server and login as the stored credentials (so a saved password may be reused). */
function sameEndpoint(a: { host: string; port: number; user: string } | undefined, b: { host: string; port: number; user: string }) {
  return Boolean(a) && a!.host.toLowerCase() === b.host.toLowerCase() && a!.port === b.port && a!.user === b.user
}

/**
 * Update server settings and/or passwords. Blank passwords keep the stored
 * ones — but only while host, port and username are unchanged, so a saved
 * password is never sent to a different server. The new credentials are
 * tested before they are saved.
 */
export async function updateInboxCredentials(ctx: Ctx, id: string, scope: InboxScope, input: CredentialsInput) {
  const account = await getManagedAccount(ctx, id, scope)
  if (account.provider !== "imap") fail("This inbox is connected with OAuth. Reconnect it instead.")
  const stored = decryptCredentials(account.credentialsEnc)
  const imapBase = { host: input.imap.host.toLowerCase(), port: input.imap.port, secure: input.imap.secure, user: input.imap.user }
  const imap: ImapCredentials = {
    ...imapBase,
    pass: input.imap.pass || (sameEndpoint(stored.imap, imapBase) ? stored.imap?.pass : undefined),
  }
  const smtpBase = {
    host: input.smtp.host.toLowerCase(),
    port: input.smtp.port,
    secure: input.smtp.secure,
    user: input.smtpSameAsImap ? imap.user : input.smtp.user,
  }
  const typedSmtpPass = input.smtpSameAsImap ? input.imap.pass : input.smtp.pass
  const smtp: SmtpCredentials = {
    ...smtpBase,
    pass: typedSmtpPass || (sameEndpoint(stored.smtp, smtpBase) ? stored.smtp?.pass : undefined),
  }
  if (!imap.pass) fail("Enter the IMAP password (required when the server or username changes).")
  if (!smtp.pass) fail("Enter the SMTP password (required when the server or username changes).")

  const result = await runConnectionTest(ctx, imap, smtp)
  if (!result.imap.ok) return { saved: false as const, result: { ...result, token: undefined } }

  await db
    .update(schema.accounts)
    .set({
      credentialsEnc: encryptCredentials({ ...stored, imap, smtp }),
      config: {
        ...account.config,
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecure: imap.secure,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        username: imap.user,
      },
      status: account.status === "paused" ? "paused" : "pending",
      lastError: null,
    })
    .where(and(eq(schema.accounts.id, account.id), eq(schema.accounts.orgId, ctx.org.id)))
  if (account.status !== "paused") await enqueueJob("account.sync", { accountId: account.id })
  return { saved: true as const, result: { ...result, token: undefined }, account }
}

export async function setInboxPaused(ctx: Ctx, id: string, scope: InboxScope, paused: boolean) {
  const account = await getManagedAccount(ctx, id, scope)
  if (paused === (account.status === "paused")) return { account, changed: false }
  await db
    .update(schema.accounts)
    .set({ status: paused ? "paused" : "pending", ...(paused ? {} : { lastError: null }) })
    .where(and(eq(schema.accounts.id, account.id), eq(schema.accounts.orgId, ctx.org.id)))
  // Paused: the worker stops the connection; resumed: it reconnects
  await enqueueJob("account.sync", { accountId: account.id })
  return { account, changed: true }
}

export async function requestInboxSync(ctx: Ctx, id: string, scope: InboxScope) {
  const account = await getManagedAccount(ctx, id, scope)
  if (account.status === "paused") fail("Resume the inbox before syncing.")
  const limit = await rateLimit(`inbox-sync:${account.id}`, 10, 5 * 60)
  if (!limit.ok) fail("A sync was requested several times recently. Please wait a moment.", 429)
  await enqueueJob("account.sync", { accountId: account.id })
  return { account }
}

/* --------------------------------- Delete --------------------------------- */

export async function deleteInbox(ctx: Ctx, id: string, scope: InboxScope, conversations: "keep" | "delete") {
  const account = await getManagedAccount(ctx, id, scope)
  const c = schema.conversations
  const result = await db.transaction(async (tx) => {
    let affected = 0
    let storageKeys: string[] = []
    if (conversations === "delete") {
      storageKeys = await attachmentKeysForConversations(tx, ctx.org.id, { accountIds: [account.id] })
      await deleteCommentAttachmentRows(tx, ctx.org.id, [account.id])
      const rows = await tx
        .delete(c)
        .where(and(eq(c.orgId, ctx.org.id), eq(c.accountId, account.id)))
        .returning({ id: c.id })
      affected = rows.length
    } else {
      const rows = await tx
        .update(c)
        .set({ accountId: null })
        .where(and(eq(c.orgId, ctx.org.id), eq(c.accountId, account.id)))
        .returning({ id: c.id })
      affected = rows.length
    }
    // signatures.account_id cascades on delete — detach so signatures survive the inbox
    await tx
      .update(schema.signatures)
      .set({ accountId: null })
      .where(and(eq(schema.signatures.orgId, ctx.org.id), eq(schema.signatures.accountId, account.id)))
    // Rules scoped to this inbox: drop it from the scope; rules left without any
    // inbox are disabled instead of silently applying to every inbox.
    await tx.execute(sql`
      update rules
      set account_ids = array_remove(account_ids, ${account.id}::uuid),
          enabled = case when cardinality(array_remove(account_ids, ${account.id}::uuid)) = 0 then false else enabled end
      where org_id = ${ctx.org.id} and ${account.id}::uuid = any(account_ids)
    `)
    await tx.delete(schema.accounts).where(and(eq(schema.accounts.id, account.id), eq(schema.accounts.orgId, ctx.org.id)))
    return { affected, storageKeys }
  })
  // Let the worker drop its connection for this account right away
  await enqueueJob("account.sync", { accountId: account.id })
  return { account, conversations: result.affected, storageKeys: result.storageKeys }
}
