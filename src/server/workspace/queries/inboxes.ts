import "server-only"
import { and, asc, eq, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { getSettings } from "@/server/settings"
import { decryptCredentials, MAIL_PRESETS } from "@/server/mail/credentials"
import { listMemberOptions, listTeamOptions } from "@/server/workspace/queries/common"
import type {
  AccessLevel,
  AccessValue,
  ConnectOptions,
  InboxDetail,
  InboxListItem,
  InboxProvider,
  InboxScope,
  InboxStatus,
  SignatureOpt,
} from "@/components/settings/inboxes/types"

type Ctx = Pick<OrgContext, "org" | "user" | "permissions">

function scopeWhere(ctx: Ctx, scope: InboxScope) {
  const a = schema.accounts
  return and(eq(a.orgId, ctx.org.id), scope === "shared" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id))
}

export async function listInboxes(ctx: Ctx, scope: InboxScope, onlyId?: string): Promise<InboxListItem[]> {
  const a = schema.accounts
  const t = schema.teams
  const rows = await db
    .select({
      id: a.id,
      name: a.name,
      email: a.email,
      color: a.color,
      provider: a.provider,
      status: a.status,
      lastError: a.lastError,
      lastSyncedAt: a.lastSyncedAt,
      createdAt: a.createdAt,
      teamId: t.id,
      teamName: t.name,
      teamColor: t.color,
      teamGrants: sql<number>`(select count(*)::int from account_access aa where aa.account_id = ${a.id} and aa.team_id is not null)`,
      userGrants: sql<number>`(select count(*)::int from account_access aa where aa.account_id = ${a.id} and aa.user_id is not null)`,
      conversationCount: sql<number>`(select count(*)::int from conversations c where c.account_id = ${a.id} and c.org_id = ${ctx.org.id})`,
    })
    .from(a)
    .leftJoin(t, and(eq(t.id, a.teamId), eq(t.orgId, ctx.org.id)))
    .where(and(scopeWhere(ctx, scope), onlyId ? eq(a.id, onlyId) : undefined))
    .orderBy(asc(a.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    color: r.color,
    provider: r.provider as InboxProvider,
    status: r.status as InboxStatus,
    lastError: r.lastError,
    lastSyncedAt: r.lastSyncedAt,
    createdAt: r.createdAt,
    team: r.teamId ? { id: r.teamId, name: r.teamName!, color: r.teamColor! } : null,
    access: { teams: Number(r.teamGrants), users: Number(r.userGrants) },
    conversationCount: Number(r.conversationCount),
  }))
}

export async function getConnectOptions(ctx: Ctx, scope: InboxScope): Promise<ConnectOptions> {
  const [oauth, security, teams, members] = await Promise.all([
    getSettings("oauth"),
    getSettings("security"),
    scope === "shared" ? listTeamOptions(ctx.org.id) : Promise.resolve([]),
    scope === "shared" ? listMemberOptions(ctx.org.id) : Promise.resolve([]),
  ])
  return {
    scope,
    presets: Object.entries(MAIL_PRESETS).map(([id, p]) => ({ id, label: p.label, imap: p.imap, smtp: p.smtp, help: p.help })),
    oauth: {
      google: oauth.google.enabled && Boolean(oauth.google.clientId && oauth.google.clientSecretEnc),
      microsoft: oauth.microsoft.enabled && Boolean(oauth.microsoft.clientId && oauth.microsoft.clientSecretEnc),
    },
    teams,
    members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })),
    blockPrivateNetworks: security.blockPrivateNetworks,
    defaultFromName: scope === "shared" ? ctx.org.name : (ctx.user.name ?? ""),
  }
}

export async function getInboxDetail(ctx: Ctx, id: string, scope: InboxScope): Promise<InboxDetail | null> {
  const a = schema.accounts
  const [row] = await db
    .select()
    .from(a)
    .where(and(eq(a.id, id), scopeWhere(ctx, scope)))
    .limit(1)
  if (!row) return null

  const [list] = await listInboxes(ctx, scope, row.id)
  const grants = await db
    .select({ teamId: schema.accountAccess.teamId, userId: schema.accountAccess.userId, level: schema.accountAccess.level })
    .from(schema.accountAccess)
    .where(eq(schema.accountAccess.accountId, row.id))

  const creds = row.provider === "demo" ? {} : decryptCredentials(row.credentialsEnc)
  const cfg = row.config
  const imap = creds.imap
    ? { host: creds.imap.host, port: creds.imap.port, secure: creds.imap.secure, user: creds.imap.user }
    : cfg.imapHost
      ? { host: cfg.imapHost, port: cfg.imapPort ?? 993, secure: cfg.imapSecure ?? true, user: cfg.username ?? row.email }
      : null
  const smtp = creds.smtp
    ? { host: creds.smtp.host, port: creds.smtp.port, secure: creds.smtp.secure, user: creds.smtp.user }
    : cfg.smtpHost
      ? { host: cfg.smtpHost, port: cfg.smtpPort ?? 465, secure: cfg.smtpSecure ?? true, user: cfg.username ?? row.email }
      : null

  const accessValue: AccessValue = {
    mode: grants.length ? "specific" : "everyone",
    grants: grants
      .filter((g) => g.teamId || g.userId)
      .map((g) => ({
        kind: g.teamId ? ("team" as const) : ("user" as const),
        id: (g.teamId ?? g.userId)!,
        level: g.level as AccessLevel,
      })),
  }

  return {
    ...list!,
    scope,
    fromName: row.fromName,
    aliases: row.aliases,
    signatureId: row.signatureId,
    config: {
      syncDays: cfg.syncDays ?? 30,
      markReadOnServer: cfg.markReadOnServer ?? false,
      saveSentCopy: cfg.saveSentCopy ?? true,
      autoCc: cfg.autoCc ?? [],
      autoBcc: cfg.autoBcc ?? [],
      inboxPath: cfg.inboxPath ?? "INBOX",
      sentPath: cfg.sentPath ?? "",
      archivePath: cfg.archivePath ?? "",
      trashPath: cfg.trashPath ?? "",
      spamPath: cfg.spamPath ?? "",
    },
    connection: {
      imap,
      smtp,
      hasPassword: Boolean(creds.imap?.pass),
      oauth: creds.oauth ? { provider: creds.oauth.provider } : row.provider === "gmail" ? { provider: "google" } : row.provider === "outlook" ? { provider: "microsoft" } : null,
    },
    accessValue,
  }
}

/** Signatures that may be set as an inbox default. */
export async function listSignatureOptions(ctx: Ctx, scope: InboxScope): Promise<SignatureOpt[]> {
  const sg = schema.signatures
  const rows = await db
    .select({ id: sg.id, name: sg.name, ownerUserId: sg.ownerUserId })
    .from(sg)
    .where(
      and(
        eq(sg.orgId, ctx.org.id),
        scope === "shared" ? isNull(sg.ownerUserId) : or(isNull(sg.ownerUserId), eq(sg.ownerUserId, ctx.user.id))
      )
    )
    .orderBy(asc(sg.name))
  return rows.map((r) => ({ id: r.id, name: r.name, personal: r.ownerUserId !== null }))
}

/** Everything the inbox edit page needs, or null when not found / not permitted. */
export async function loadInboxEditor(ctx: Ctx, id: string, scope: InboxScope) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const inbox = await getInboxDetail(ctx, id, scope)
  if (!inbox) return null
  const [teams, members, signatures, oauth] = await Promise.all([
    scope === "shared" ? listTeamOptions(ctx.org.id) : Promise.resolve([]),
    scope === "shared" ? listMemberOptions(ctx.org.id, { includeSuspended: true }) : Promise.resolve([]),
    listSignatureOptions(ctx, scope),
    getSettings("oauth"),
  ])
  return {
    inbox,
    teams,
    members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email, avatarUrl: m.avatarUrl })),
    signatures,
    oauth: {
      google: oauth.google.enabled && Boolean(oauth.google.clientId && oauth.google.clientSecretEnc),
      microsoft: oauth.microsoft.enabled && Boolean(oauth.microsoft.clientId && oauth.microsoft.clientSecretEnc),
    },
  }
}
