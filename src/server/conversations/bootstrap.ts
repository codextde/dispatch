import "server-only"
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { getSettings } from "@/server/settings"
import type { AccountSummary, Bootstrap, BoxCounts, ChatSummary, InboxSettings, SignatureSummary } from "@/lib/inbox/types"
import {
  activeSql,
  assignedToSql,
  awakeSql,
  emailSql,
  hasMessagesSql,
  mentionedSql,
  openSql,
  unassignedSql,
  unreadSql,
  userFlagSql,
} from "./boxes"
import { visibleWhere, type Ctx, type InboxScope } from "./scope"

const c = schema.conversations

/** Unread counts for sidebar boxes, teams, accounts and labels. */
export async function getBoxCounts(ctx: Ctx, scope: InboxScope): Promise<BoxCounts> {
  const me = ctx.user.id
  const visible = visibleWhere(ctx, scope)
  const unread = unreadSql(me)
  const workable = and(emailSql, activeSql, awakeSql, hasMessagesSql, openSql)!
  const personal = scope.personalAccountIds.length ? inArray(c.accountId, scope.personalAccountIds) : sql`false`

  const [main] = await db
    .select({
      inbox: sql<number>`count(*) filter (where ${workable} and ${unread} and (${personal} or ${assignedToSql(me)} or ${userFlagSql(me, "following")}))::int`,
      assigned: sql<number>`count(*) filter (where ${workable} and ${unread} and ${assignedToSql(me)})::int`,
      unassigned: sql<number>`count(*) filter (where ${workable} and ${unread} and ${unassignedSql})::int`,
      mentions: sql<number>`count(*) filter (where ${activeSql} and ${unread} and ${mentionedSql(me)})::int`,
      chats: sql<number>`count(*) filter (where ${c.kind} = 'chat' and ${me}::uuid = any(${c.chatMemberIds}) and ${unread})::int`,
    })
    .from(c)
    .where(visible)

  const [outbox] = await db
    .select({
      drafts: sql<number>`count(distinct ${schema.messages.conversationId}) filter (where ${schema.messages.status} = 'draft')::int`,
      scheduled: sql<number>`count(distinct ${schema.messages.conversationId}) filter (where ${schema.messages.status} = 'scheduled')::int`,
    })
    .from(schema.messages)
    .innerJoin(c, eq(c.id, schema.messages.conversationId))
    .where(and(eq(schema.messages.orgId, ctx.org.id), eq(schema.messages.authorId, me), eq(c.isTrash, false)))

  const counts: BoxCounts = { ...(main ?? {}), ...(outbox ?? {}) }

  if (scope.accountIds.length) {
    const perAccount = await db
      .select({ accountId: c.accountId, n: sql<number>`count(*)::int` })
      .from(c)
      .where(and(visible, workable, unread, inArray(c.accountId, scope.accountIds)))
      .groupBy(c.accountId)
    for (const r of perAccount) if (r.accountId) counts[`inbox.${r.accountId}`] = r.n
  }

  const perTeam = await db.execute<{ team_id: string; n: number }>(sql`
    select t.id as team_id, count(*)::int as n
    from teams t
    join conversations on (conversations.team_id = t.id or conversations.account_id in (select a.id from accounts a where a.org_id = ${ctx.org.id} and a.team_id = t.id))
    where t.org_id = ${ctx.org.id} and ${visible} and ${workable} and ${unread}
    group by t.id`)
  for (const r of perTeam) counts[`team.${r.team_id}`] = Number(r.n)

  const perLabel = await db
    .select({ labelId: schema.conversationLabels.labelId, n: sql<number>`count(*)::int` })
    .from(schema.conversationLabels)
    .innerJoin(c, eq(c.id, schema.conversationLabels.conversationId))
    .where(and(visible, activeSql, hasMessagesSql, openSql, unread))
    .groupBy(schema.conversationLabels.labelId)
  for (const r of perLabel) counts[`label.${r.labelId}`] = r.n

  return counts
}

export async function listChats(ctx: Ctx): Promise<ChatSummary[]> {
  const me = ctx.user.id
  const rows = await db
    .select({
      id: c.id,
      subject: c.subject,
      memberIds: c.chatMemberIds,
      lastActivityAt: c.lastActivityAt,
      snippet: c.snippet,
      unread: sql<boolean>`${unreadSql(me)}`,
    })
    .from(c)
    .where(and(eq(c.orgId, ctx.org.id), eq(c.kind, "chat"), isNull(c.mergedIntoId), sql`${me}::uuid = any(${c.chatMemberIds})`))
    .orderBy(sql`${c.lastActivityAt} desc`)
    .limit(200)
  return rows.map((r) => ({
    id: r.id,
    name: r.subject,
    memberIds: r.memberIds,
    isDirect: !r.subject && r.memberIds.length === 2,
    unread: Boolean(r.unread),
    lastActivityAt: r.lastActivityAt.toISOString(),
    snippet: r.snippet,
  }))
}

export async function getInboxSettings(ctx: Ctx): Promise<InboxSettings> {
  const [security, storage] = await Promise.all([getSettings("security"), getSettings("storage")])
  const pref = (ctx.user.preferences as { undoSendSeconds?: number } | null)?.undoSendSeconds
  const orgUndo = ctx.org.settings?.undoSendSeconds
  return {
    undoSendSeconds: Math.min(Math.max(typeof pref === "number" ? pref : typeof orgUndo === "number" ? orgUndo : 5, 0), 60),
    remoteImages: security.remoteImages,
    closeOnReply: Boolean(ctx.org.settings?.closeOnReply),
    maxAttachmentMb: storage.maxAttachmentMb,
  }
}

function pickDefaultSignature(
  account: { id: string; signatureId: string | null },
  sigs: (typeof schema.signatures.$inferSelect)[],
  me: string
): string | null {
  if (account.signatureId && sigs.some((s) => s.id === account.signatureId)) return account.signatureId
  const mine = sigs.filter((s) => s.ownerUserId === me)
  const org = sigs.filter((s) => s.ownerUserId === null)
  const pick = (list: typeof sigs) =>
    list.find((s) => s.accountId === account.id && s.isDefault) ??
    list.find((s) => s.accountId === account.id) ??
    list.find((s) => s.accountId === null && s.isDefault)
  return (pick(mine) ?? pick(org))?.id ?? null
}

export async function getBootstrap(ctx: Ctx, scope: InboxScope): Promise<Bootstrap> {
  const me = ctx.user.id
  const orgId = ctx.org.id
  const [members, teams, teamMembers, accounts, labels, signatures, chats, counts, settings] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        lastSeenAt: schema.users.lastSeenAt,
        title: schema.memberships.title,
        roleKey: schema.roles.key,
        roleName: schema.roles.name,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.status, "active"), eq(schema.users.status, "active")))
      .orderBy(asc(sql`lower(coalesce(${schema.users.name}, ${schema.users.email}))`)),
    db.select().from(schema.teams).where(eq(schema.teams.orgId, orgId)).orderBy(asc(schema.teams.name)),
    db
      .select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId })
      .from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
      .where(eq(schema.teams.orgId, orgId)),
    scope.accountIds.length
      ? db
          .select()
          .from(schema.accounts)
          .where(and(eq(schema.accounts.orgId, orgId), inArray(schema.accounts.id, scope.accountIds)))
          .orderBy(asc(schema.accounts.name))
      : Promise.resolve([]),
    db
      .select()
      .from(schema.labels)
      .where(and(eq(schema.labels.orgId, orgId), or(eq(schema.labels.visibility, "shared"), eq(schema.labels.ownerUserId, me))))
      .orderBy(asc(schema.labels.position), asc(schema.labels.name)),
    db
      .select()
      .from(schema.signatures)
      .where(
        and(
          eq(schema.signatures.orgId, orgId),
          or(isNull(schema.signatures.ownerUserId), eq(schema.signatures.ownerUserId, me)),
          scope.accountIds.length
            ? or(isNull(schema.signatures.accountId), inArray(schema.signatures.accountId, scope.accountIds))
            : isNull(schema.signatures.accountId)
        )
      )
      .orderBy(asc(schema.signatures.name)),
    listChats(ctx),
    getBoxCounts(ctx, scope),
    getInboxSettings(ctx),
  ])

  const myMembership = members.find((m) => m.id === me)
  const accountSummaries: AccountSummary[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    fromName: a.fromName,
    aliases: a.aliases,
    color: a.color,
    provider: a.provider,
    status: a.status,
    lastError: a.lastError,
    teamId: a.teamId,
    ownerUserId: a.ownerUserId,
    isPersonal: a.ownerUserId !== null,
    level: scope.access.get(a.id) ?? "read",
    defaultSignatureId: pickDefaultSignature(a, signatures, me),
  }))
  const sigSummaries: SignatureSummary[] = signatures.map((s) => ({
    id: s.id,
    name: s.name,
    body: s.body,
    accountId: s.accountId,
    isOrg: s.ownerUserId === null,
    isDefault: s.isDefault,
  }))

  return {
    me: {
      id: me,
      name: ctx.user.name,
      email: ctx.user.email,
      avatarUrl: ctx.user.avatarUrl,
      title: myMembership?.title ?? null,
      preferences: (ctx.user.preferences ?? {}) as Record<string, unknown>,
    },
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      title: m.title,
      role: { key: m.roleKey, name: m.roleName },
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    })),
    teams: teams.map((t) => {
      const memberIds = teamMembers.filter((tm) => tm.teamId === t.id).map((tm) => tm.userId)
      return { id: t.id, name: t.name, color: t.color, icon: t.icon, memberIds, isMember: memberIds.includes(me) }
    }),
    accounts: accountSummaries,
    labels: labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      parentId: l.parentId,
      visibility: l.visibility,
      position: l.position,
      showInSidebar: l.showInSidebar,
      teamId: l.teamId,
    })),
    signatures: sigSummaries,
    chats,
    counts,
    settings,
  }
}
