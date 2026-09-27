import "server-only"
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { Account, Conversation, Message, Rule, RuleAction } from "@/server/db/schema"
import { publish } from "@/server/realtime"
import { emitWebhook, enqueueJob } from "@/server/jobs"
import { deleteObject, getObjectBuffer, makeStorageKey, putObject } from "@/server/storage"
import { renderTemplate, escapeHtml } from "@/lib/inbox/templates"
import { createRegexBudget, evaluateConditions, isWithinBusinessHours, unsafePatterns, type RuleEvalContext } from "./conditions"
import { getSettings } from "@/server/settings"
import { workspaceInboxAddresses } from "@/server/workspace/inbox-addresses"
import { canUseCannedResponse } from "@/server/workspace/response-access"
import { assignConversation, autoAssignToTeam, isActiveMember, isAssignStrategy } from "./assign"
import { generateMessageId, htmlToPlainText, isAutomatedMessage, isBounceOrAutoReply, normalizeEmail } from "@/server/mail/parse"

/**
 * Rules engine: runs the workspace's automation rules for a message.
 *
 *   runRules({ orgId, trigger: "incoming", conversationId, messageId })
 *
 * Shared inboxes run the workspace rules; personal inboxes their owner's
 * personal rules plus workspace rules that explicitly target them. Workspace webhooks are never emitted
 * for personal inboxes. Every action is isolated: a failing action is logged
 * and the remaining actions still run.
 */

export type RunRulesInput = {
  orgId: string
  trigger: "incoming" | "outgoing"
  conversationId: string
  messageId: string
}

const AUTO_REPLY_WINDOW_MS = 24 * 3600_000
const AUTO_REPLY_SUBJECT = "Automatic reply"
const MAX_FORWARD_HOPS = 5
const MAX_SNOOZE_MINUTES = 365 * 24 * 60
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/

type RunState = {
  /** Workspace webhooks are only emitted for shared inboxes (personal mail stays private) */
  emitWebhooks: boolean
  orgId: string
  trigger: RunRulesInput["trigger"]
  rule: Rule
  conversation: Conversation
  message: Message
  account: Account | null
  ctx: RuleEvalContext
}

export async function runRules(input: RunRulesInput): Promise<{ applied: string[] }> {
  const message = await db.query.messages.findFirst({
    where: and(eq(schema.messages.id, input.messageId), eq(schema.messages.orgId, input.orgId)),
  })
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, input.conversationId), eq(schema.conversations.orgId, input.orgId)),
  })
  if (!message || !conversation) return { applied: [] }
  const account = message.accountId
    ? ((await db.query.accounts.findFirst({ where: eq(schema.accounts.id, message.accountId) })) ?? null)
    : null

  // Shared inboxes run workspace rules; personal inboxes run their owner's personal rules
  // (and workspace rules only when they explicitly target that inbox, see the filter below)
  const r = schema.rules
  const owners = account?.ownerUserId ? or(isNull(r.ownerUserId), eq(r.ownerUserId, account.ownerUserId)) : isNull(r.ownerUserId)
  const rules = (
    await db
      .select()
      .from(r)
      .where(and(eq(r.orgId, input.orgId), eq(r.enabled, true), eq(r.trigger, input.trigger), owners))
      .orderBy(sql`${r.ownerUserId} is not null`, asc(r.position), asc(r.createdAt))
  ).filter((rule) => {
    // Personal inboxes are private: workspace rules only apply when they explicitly target that inbox
    // (the owner's personal rules always apply).
    if (account?.ownerUserId && !rule.ownerUserId) return rule.accountIds.includes(account.id)
    return !rule.accountIds.length || (account != null && rule.accountIds.includes(account.id))
  })
  if (!rules.length) return { applied: [] }

  const labels = await db
    .select({ id: schema.labels.id, name: schema.labels.name })
    .from(schema.conversationLabels)
    .innerJoin(schema.labels, eq(schema.labels.id, schema.conversationLabels.labelId))
    .where(eq(schema.conversationLabels.conversationId, conversation.id))

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, input.orgId),
    columns: { settings: true },
  })
  const timeZone = org?.settings.timezone || (await getSettings("general")).defaultTimezone || "UTC"
  const messageDate = message.receivedAt ?? message.sentAt ?? message.createdAt

  const ctx: RuleEvalContext = {
    from: message.fromEmail ? { name: message.fromName, email: message.fromEmail } : null,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    body: (message.textBody || (message.htmlBody ? htmlToPlainText(message.htmlBody) : "")).slice(0, 20_000),
    account: account ? { id: account.id, email: account.email, name: account.name } : null,
    hasAttachment: message.hasAttachments,
    headers: message.headers ?? {},
    labels,
    inBusinessHours: isWithinBusinessHours(messageDate, org?.settings.businessHours, timeZone),
    // One regex time budget for all rules of this message (a pattern can't block the worker)
    regexBudget: createRegexBudget(),
  }

  const applied: string[] = []
  let current = conversation
  for (const rule of rules) {
    const refused = unsafePatterns(rule.conditions)
    if (refused.length) console.warn(`[rules] rule ${rule.id} has unsafe regex patterns that never match: ${refused.join(" | ").slice(0, 200)}`)
    let matched = false
    try {
      matched = evaluateConditions(rule.conditions, ctx)
    } catch (err) {
      console.error(`[rules] condition evaluation failed for rule ${rule.id}`, err)
    }
    if (!matched) continue

    const state: RunState = { emitWebhooks: !account?.ownerUserId, orgId: input.orgId, trigger: input.trigger, rule, conversation: current, message, account, ctx }
    const done: string[] = []
    for (const action of rule.actions ?? []) {
      try {
        if (await executeAction(state, action)) done.push(action.type)
      } catch (err) {
        console.error(`[rules] action ${action.type} of rule ${rule.id} failed`, err)
      }
    }
    applied.push(rule.id)
    await db
      .update(r)
      .set({ runCount: sql`${r.runCount} + 1`, lastRunAt: new Date() })
      .where(eq(r.id, rule.id))
    await db.insert(schema.conversationEvents).values({
      orgId: input.orgId,
      conversationId: conversation.id,
      actorId: null,
      type: "rule_applied",
      data: { ruleId: rule.id, name: rule.name, actions: done },
    })
    const refreshed = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversation.id) })
    if (refreshed) current = refreshed
    if (rule.stopProcessing) break
  }

  if (applied.length) await publish({ orgId: input.orgId, type: "conversation.updated", conversationId: conversation.id })
  return { applied }
}

/* ---------------------------------- Actions --------------------------------- */

async function executeAction(s: RunState, action: RuleAction): Promise<boolean> {
  const c = schema.conversations
  const convId = s.conversation.id
  switch (action.type) {
    case "add_label": {
      const label = await loadLabel(s, action.labelId)
      if (!label) return false
      await db.insert(schema.conversationLabels).values({ conversationId: convId, labelId: label.id, addedBy: null }).onConflictDoNothing()
      if (!s.ctx.labels.some((l) => l.id === label.id)) s.ctx.labels.push({ id: label.id, name: label.name })
      if (s.emitWebhooks)
        await emitWebhook(s.orgId, "conversation.labeled", {
        conversationId: convId,
        number: s.conversation.number,
        labelIds: [label.id],
        labeledBy: null,
      })
      return true
    }
    case "remove_label": {
      await db
        .delete(schema.conversationLabels)
        .where(and(eq(schema.conversationLabels.conversationId, convId), eq(schema.conversationLabels.labelId, action.labelId)))
      s.ctx.labels = s.ctx.labels.filter((l) => l.id !== action.labelId)
      return true
    }
    case "assign": {
      if (!action.userId || !(await isActiveMember(s.orgId, action.userId))) return false
      return assignConversation({ orgId: s.orgId, conversationId: convId, userId: action.userId, reason: "rule", ruleId: s.rule.id })
    }
    case "assign_team": {
      const team = await db.query.teams.findFirst({
        where: and(eq(schema.teams.id, action.teamId), eq(schema.teams.orgId, s.orgId)),
      })
      if (!team) return false
      if (s.conversation.teamId !== team.id) {
        await db.update(c).set({ teamId: team.id }).where(eq(c.id, convId))
        await db.insert(schema.conversationEvents).values({
          orgId: s.orgId,
          conversationId: convId,
          actorId: null,
          type: "moved",
          data: { teamId: team.id, fromTeamId: s.conversation.teamId, ruleId: s.rule.id },
        })
      }
      if (action.balance) {
        const strategy = isAssignStrategy(team.assignmentStrategy) ? team.assignmentStrategy : "round_robin"
        await autoAssignToTeam({ orgId: s.orgId, conversationId: convId, teamId: team.id, strategy, reason: "rule", ruleId: s.rule.id })
      }
      return true
    }
    case "close": {
      if (s.conversation.status === "closed") return false
      await db.update(c).set({ status: "closed", closedAt: new Date(), closedBy: null }).where(eq(c.id, convId))
      if (s.emitWebhooks) await emitWebhook(s.orgId, "conversation.closed", { conversationId: convId, number: s.conversation.number, closedBy: null })
      return true
    }
    case "mark_spam":
      await db.update(c).set({ isSpam: true }).where(eq(c.id, convId))
      return true
    case "trash":
      await db.update(c).set({ isTrash: true }).where(eq(c.id, convId))
      return true
    case "priority":
      await db.update(c).set({ priority: true }).where(eq(c.id, convId))
      return true
    case "star": {
      const userId = s.rule.ownerUserId ?? s.account?.ownerUserId
      if (!userId) return false
      await db
        .insert(schema.conversationUserState)
        .values({ conversationId: convId, userId, starred: true })
        .onConflictDoUpdate({
          target: [schema.conversationUserState.conversationId, schema.conversationUserState.userId],
          set: { starred: true },
        })
      return true
    }
    case "snooze": {
      const minutes = Math.min(Math.max(Math.round(Number(action.minutes) || 0), 1), MAX_SNOOZE_MINUTES)
      const until = new Date(Date.now() + minutes * 60_000)
      await db
        .update(c)
        .set({ snoozedUntil: until, snoozedBy: s.rule.ownerUserId ?? s.account?.ownerUserId ?? null })
        .where(eq(c.id, convId))
      await db.insert(schema.conversationEvents).values({
        orgId: s.orgId,
        conversationId: convId,
        actorId: null,
        type: "snoozed",
        data: { until: until.toISOString(), ruleId: s.rule.id },
      })
      return true
    }
    case "mark_read":
      return markRead(s)
    case "auto_reply":
      return autoReply(s, action)
    case "forward":
      return forward(s, action.to)
    case "comment":
      return addComment(s, action.body)
    case "webhook": {
      let url: URL
      try {
        url = new URL(action.url)
      } catch {
        return false
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return false
      await enqueueJob(
        "rule.webhook",
        {
          url: url.toString(),
          ruleId: s.rule.id,
          orgId: s.orgId,
          body: {
            event: "rule.matched",
            createdAt: new Date().toISOString(),
            rule: { id: s.rule.id, name: s.rule.name },
            conversation: { id: convId, number: s.conversation.number, subject: s.conversation.subject },
            message: {
              id: s.message.id,
              direction: s.message.direction,
              from: { name: s.message.fromName, email: s.message.fromEmail },
              to: s.message.to,
              cc: s.message.cc,
              subject: s.message.subject,
              snippet: s.message.snippet,
            },
          },
        },
        { maxAttempts: 6 }
      )
      return true
    }
    default:
      return false
  }
}

async function loadLabel(s: RunState, labelId: string) {
  const label = await db.query.labels.findFirst({
    where: and(eq(schema.labels.id, labelId), eq(schema.labels.orgId, s.orgId)),
  })
  if (!label) return null
  // Private labels may only be applied by their owner's personal rules
  if (label.visibility === "private" && label.ownerUserId !== s.rule.ownerUserId) return null
  return label
}

/** Users considered "readers" of the inbox: owner (personal) or everyone with access (shared). */
async function inboxReaders(account: Account | null): Promise<string[]> {
  if (!account) return []
  if (account.ownerUserId) return [account.ownerUserId]
  const grants = await db
    .select({ userId: schema.accountAccess.userId, teamId: schema.accountAccess.teamId })
    .from(schema.accountAccess)
    .where(eq(schema.accountAccess.accountId, account.id))
  const teamIds = [...new Set([...grants.map((g) => g.teamId), account.teamId].filter((t): t is string => Boolean(t)))]
  const teamUsers = teamIds.length
    ? await db
        .select({ userId: schema.teamMembers.userId })
        .from(schema.teamMembers)
        .where(inArray(schema.teamMembers.teamId, teamIds))
    : []
  return [...new Set([...grants.map((g) => g.userId), ...teamUsers.map((t) => t.userId)].filter((u): u is string => Boolean(u)))]
}

async function markRead(s: RunState): Promise<boolean> {
  const users = await inboxReaders(s.account)
  if (!users.length) return false
  // Unread is derived from lastReadAt >= conversations.last_activity_at
  const readAt = sql`greatest(now(), (select last_activity_at from conversations where id = ${s.conversation.id}))`
  await db
    .insert(schema.conversationUserState)
    .values(users.map((userId) => ({ conversationId: s.conversation.id, userId, unread: false, lastReadAt: readAt })))
    .onConflictDoUpdate({
      target: [schema.conversationUserState.conversationId, schema.conversationUserState.userId],
      set: { unread: false, lastReadAt: readAt },
    })
  return true
}

/** Our own inbox addresses (never auto-reply / forward to ourselves). Personal inboxes only count for their owner's own rules. */
async function orgAddresses(orgId: string, ownerUserId?: string | null): Promise<Set<string>> {
  return workspaceInboxAddresses(orgId, { ownerUserId })
}

async function queueOutbound(
  s: RunState,
  msg: {
    to: { name?: string | null; email: string }[]
    subject: string
    html: string
    inReplyTo?: string | null
    references?: string[]
    headers: Record<string, string>
  },
  opts: { hold?: boolean } = {}
) {
  const account = s.account!
  const fromEmail = account.email
  const text = htmlToPlainText(msg.html)
  const [row] = await db
    .insert(schema.messages)
    .values({
      orgId: s.orgId,
      conversationId: s.conversation.id,
      accountId: account.id,
      direction: "outbound",
      // "draft" (authorless, invisible) while attachments are still being attached
      status: opts.hold ? "draft" : "queued",
      messageId: generateMessageId(fromEmail),
      inReplyTo: msg.inReplyTo ?? null,
      references: msg.references ?? [],
      fromName: account.fromName || account.name,
      fromEmail,
      to: msg.to,
      subject: msg.subject.slice(0, 998),
      htmlBody: msg.html,
      textBody: text,
      snippet: text.replace(/\s+/g, " ").trim().slice(0, 200),
      headers: msg.headers,
      authorId: null,
      sendAt: new Date(),
    })
    .returning({ id: schema.messages.id })
  if (!opts.hold) await wakeSender()
  return row!.id
}

async function wakeSender() {
  await db.execute(sql`select pg_notify('dispatch_jobs', 'message.send')`).catch(() => {})
}

/** Display names come from the sender: keep them short and link-free before putting them in a reply. */
function safeDisplayName(name: string | null | undefined): string | null {
  const clean = (name ?? "").replace(/[<>"]/g, "").trim()
  if (!clean || clean.length > 60 || /[/:@]|\.[a-z]{2,}\b|www/i.test(clean)) return null
  return clean
}

async function autoReply(s: RunState, action: Extract<RuleAction, { type: "auto_reply" }>): Promise<boolean> {
  const m = s.message
  if (s.trigger !== "incoming" || m.direction !== "inbound" || !s.account) return false
  if (s.conversation.isSpam) return false
  if (isAutomatedMessage({ headers: m.headers ?? {}, fromEmail: m.fromEmail })) return false
  // RFC 3834: answer the sender only. Reply-To would let anyone aim our auto-replies at a third party.
  const recipient = m.fromEmail ? { name: m.fromName, email: m.fromEmail } : null
  if (!recipient || !EMAIL_RE.test(recipient.email)) return false
  const target = normalizeEmail(recipient.email)
  if ((await orgAddresses(s.orgId, s.account.ownerUserId)).has(target)) return false

  // At most one auto-reply per recipient per 24h (across all conversations of the workspace)
  const [recent] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.orgId, s.orgId),
        eq(schema.messages.direction, "outbound"),
        sql`${schema.messages.headers}->>'auto-submitted' = 'auto-replied'`,
        gt(schema.messages.createdAt, new Date(Date.now() - AUTO_REPLY_WINDOW_MS)),
        sql`${schema.messages.to} @> ${JSON.stringify([{ email: target }])}::jsonb`
      )
    )
    .limit(1)
  if (recent) return false

  let body = action.body ?? ""
  let subject = action.subject ?? ""
  if (action.cannedResponseId) {
    const canned = await db.query.cannedResponses.findFirst({
      where: and(eq(schema.cannedResponses.id, action.cannedResponseId), eq(schema.cannedResponses.orgId, s.orgId)),
    })
    // Personal rules may only send responses their owner can use (own, or a team response of one of their teams)
    const usable =
      canned && (s.rule.ownerUserId ? await canUseCannedResponse(s.orgId, s.rule.ownerUserId, canned) : !canned.ownerUserId)
    if (canned && usable) {
      body = canned.body
      subject = subject || canned.subject || ""
    }
  }
  if (!body.trim()) return false

  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, s.orgId), columns: { name: true } })
  const owner = s.account.ownerUserId
    ? await db.query.users.findFirst({ where: eq(schema.users.id, s.account.ownerUserId), columns: { name: true, email: true } })
    : null
  const tctx = {
    contact: { name: safeDisplayName(recipient.name), email: recipient.email },
    user: owner ?? { name: s.account.fromName || s.account.name, email: s.account.email },
    org: { name: org?.name ?? "" },
  }
  const html = renderTemplate(body, tctx)
  // Never echo the sender's subject: it would carry their text out from our domain
  const finalSubject = subject.trim() ? stripTags(renderTemplate(subject, tctx)) : AUTO_REPLY_SUBJECT
  await queueOutbound(s, {
    to: [{ name: safeDisplayName(recipient.name), email: target }],
    subject: finalSubject,
    html,
    inReplyTo: m.messageId,
    references: [...(m.references ?? []), ...(m.messageId ? [m.messageId] : [])].slice(-50),
    headers: { "auto-submitted": "auto-replied", "x-auto-response-suppress": "All", "x-dispatch-rule": s.rule.id },
  })
  return true
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

async function forward(s: RunState, toRaw: string): Promise<boolean> {
  const m = s.message
  if (!s.account) return false
  if (m.headers?.["x-dispatch-rule"]) return false // never forward rule-generated mail (loops)
  if (isBounceOrAutoReply({ headers: m.headers ?? {}, fromEmail: m.fromEmail })) return false
  const recipients = [...new Set((toRaw ?? "").split(/[,;\s]+/).map(normalizeEmail).filter((e) => EMAIL_RE.test(e)))].slice(0, 10)
  if (!recipients.length) return false
  const own = await orgAddresses(s.orgId, s.account.ownerUserId)
  // X-Loop lists every forwarding inbox the message passed: stop when it came back to us
  // (a redirect, or a forward that kept the headers) or after a few hops of other systems
  const loop = (m.headers?.["x-loop"] ?? "").split(",").map(normalizeEmail).filter(Boolean)
  if (loop.length >= MAX_FORWARD_HOPS || loop.some((address) => own.has(address))) return false
  const targets = recipients.filter((e) => !own.has(e))
  if (!targets.length) return false

  const [already] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, s.conversation.id),
        sql`${schema.messages.headers}->>'x-dispatch-forwarded-message' = ${m.id}`
      )
    )
    .limit(1)
  if (already) return false

  const fmt = (list: { name?: string | null; email: string }[]) =>
    list.map((p) => (p.name ? `${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;` : escapeHtml(p.email))).join(", ")
  const date = (m.receivedAt ?? m.sentAt ?? m.createdAt).toUTCString()
  const original = m.htmlBody
    ? (/<body[^>]*>([\s\S]*)<\/body>/i.exec(m.htmlBody)?.[1] ?? m.htmlBody).replace(/<script[\s\S]*?<\/script>/gi, "")
    : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(m.textBody ?? "")}</pre>`
  const html = `<div>---------- Forwarded message ---------<br>From: ${fmt([{ name: m.fromName, email: m.fromEmail }])}<br>Date: ${escapeHtml(date)}<br>Subject: ${escapeHtml(m.subject)}<br>To: ${fmt(m.to)}${m.cc.length ? `<br>Cc: ${fmt(m.cc)}` : ""}</div><br>${original}`

  const messageDbId = await queueOutbound(
    s,
    {
      to: targets.map((email) => ({ email })),
      subject: /^\s*fwd?:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
      html,
      headers: {
        "auto-submitted": "auto-generated",
        "x-dispatch-rule": s.rule.id,
        "x-dispatch-forwarded-message": m.id,
        "x-loop": [...loop, normalizeEmail(s.account.email)].join(", "),
      },
    },
    { hold: true }
  )

  // Copy attachments (own storage objects so deleting one conversation never breaks the other),
  // then release the message to the sender. On failure nothing is sent.
  try {
    const atts = await db.select().from(schema.attachments).where(eq(schema.attachments.messageId, m.id))
    for (const a of atts) {
      const buf = await getObjectBuffer(a.storageKey)
      if (!buf) throw new Error(`Attachment ${a.filename} could not be read from storage`)
      const key = makeStorageKey(s.orgId, a.filename)
      await putObject(key, buf, a.contentType)
      await db.insert(schema.attachments).values({
        orgId: s.orgId,
        messageId: messageDbId,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        storageKey: key,
        contentId: a.contentId,
        isInline: a.isInline,
      })
    }
    await db
      .update(schema.messages)
      .set({ status: "queued", sendAt: new Date(), hasAttachments: atts.some((a) => !a.isInline) })
      .where(eq(schema.messages.id, messageDbId))
  } catch (err) {
    const copied = await db.select({ key: schema.attachments.storageKey }).from(schema.attachments).where(eq(schema.attachments.messageId, messageDbId))
    await db.delete(schema.messages).where(eq(schema.messages.id, messageDbId))
    await Promise.all(copied.map((c) => deleteObject(c.key).catch(() => {})))
    throw err
  }
  await wakeSender()
  return true
}

async function addComment(s: RunState, text: string): Promise<boolean> {
  const body = (text ?? "").trim()
  if (!body) return false
  const html = `<p>${escapeHtml(body.slice(0, 10_000)).replace(/\r?\n/g, "<br>")}</p>`
  const [comment] = await db
    .insert(schema.comments)
    .values({ orgId: s.orgId, conversationId: s.conversation.id, authorId: null, body: html, mentions: [] })
    .returning({ id: schema.comments.id })
  await db
    .update(schema.conversations)
    .set({ commentCount: sql`${schema.conversations.commentCount} + 1` })
    .where(eq(schema.conversations.id, s.conversation.id))
  await publish({ orgId: s.orgId, type: "comment.created", conversationId: s.conversation.id, data: { commentId: comment!.id } })
  if (!s.emitWebhooks) return true
  await emitWebhook(s.orgId, "comment.created", {
    conversationId: s.conversation.id,
    commentId: comment!.id,
    authorId: null,
    body: html,
  })
  return true
}
