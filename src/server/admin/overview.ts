import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/server/db"
import { getSettings } from "@/server/settings"
import { isEmailDeliveryConfigured } from "@/server/mail/system-mailer"
import { getWorkerStatus } from "@/server/admin/system"

/** Numbers and lists for the admin overview dashboard. */

export type OverviewStats = {
  workspaces: number
  suspendedWorkspaces: number
  newWorkspaces7d: number
  users: number
  newUsers7d: number
  activeUsers7d: number
  conversations: number
  openConversations: number
  messages24h: number
  inboxes: number
  inboxesActive: number
  inboxesError: number
  payingWorkspaces: number
  trialingWorkspaces: number
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const rows = await db.execute<Record<keyof OverviewStats, number>>(sql`
    select
      o.workspaces, o.suspended_workspaces as "suspendedWorkspaces", o.new_workspaces_7d as "newWorkspaces7d",
      o.paying_workspaces as "payingWorkspaces", o.trialing_workspaces as "trialingWorkspaces",
      u.users, u.new_users_7d as "newUsers7d", u.active_users_7d as "activeUsers7d",
      c.conversations, c.open_conversations as "openConversations",
      m.messages_24h as "messages24h",
      a.inboxes, a.inboxes_active as "inboxesActive", a.inboxes_error as "inboxesError"
    from
      (select
         count(*)::int as workspaces,
         count(*) filter (where suspended_at is not null)::int as suspended_workspaces,
         count(*) filter (where created_at > now() - interval '7 days')::int as new_workspaces_7d,
         count(*) filter (where plan = 'cloud' and subscription_status in ('active', 'past_due'))::int as paying_workspaces,
         count(*) filter (where plan = 'cloud' and subscription_status = 'trialing')::int as trialing_workspaces
       from organizations) o,
      (select
         count(*)::int as users,
         count(*) filter (where created_at > now() - interval '7 days')::int as new_users_7d,
         count(*) filter (where status = 'active' and (
           last_seen_at > now() - interval '7 days'
           or exists (
             select 1 from sessions s
             where s.user_id = users.id and s.impersonator_id is null and s.last_used_at > now() - interval '7 days'
           )
         ))::int as active_users_7d
       from users) u,
      (select
         count(*) filter (where kind = 'email' and not is_trash and not is_spam)::int as conversations,
         count(*) filter (where kind = 'email' and status = 'open' and not is_trash and not is_spam)::int as open_conversations
       from conversations) c,
      (select count(*)::int as messages_24h
       from messages
       where status in ('received', 'sent') and coalesce(received_at, sent_at, created_at) > now() - interval '24 hours') m,
      (select
         count(*)::int as inboxes,
         count(*) filter (where status in ('active', 'syncing'))::int as inboxes_active,
         count(*) filter (where status = 'error')::int as inboxes_error
       from accounts where provider <> 'demo') a
  `)
  const r = rows[0]!
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v ?? 0)])) as OverviewStats
}

export type GrowthPoint = { day: string; signups: number; workspaces: number }

/** Daily signups and workspaces created for the last `days` days (zero-filled), plus the previous period's totals. */
export async function getGrowthSeries(days = 30) {
  const span = Math.max(7, Math.min(365, Math.floor(days)))
  const [series, prev] = await Promise.all([
    db.execute<{ day: string; signups: number; workspaces: number }>(sql`
      with days as (
        select generate_series(current_date - (${span - 1})::int, current_date, interval '1 day')::date as day
      ),
      u as (
        select created_at::date as day, count(*)::int as c from users
        where created_at >= current_date - (${span - 1})::int group by 1
      ),
      o as (
        select created_at::date as day, count(*)::int as c from organizations
        where created_at >= current_date - (${span - 1})::int group by 1
      )
      select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(u.c, 0)::int as signups, coalesce(o.c, 0)::int as workspaces
      from days left join u on u.day = days.day left join o on o.day = days.day
      order by days.day
    `),
    db.execute<{ signups: number; workspaces: number }>(sql`
      select
        (select count(*) from users
          where created_at >= current_date - (${2 * span - 1})::int and created_at < current_date - (${span - 1})::int)::int as signups,
        (select count(*) from organizations
          where created_at >= current_date - (${2 * span - 1})::int and created_at < current_date - (${span - 1})::int)::int as workspaces
    `),
  ])
  const points: GrowthPoint[] = series.map((p) => ({
    day: p.day,
    signups: Number(p.signups),
    workspaces: Number(p.workspaces),
  }))
  return {
    points,
    totals: {
      signups: points.reduce((s, p) => s + p.signups, 0),
      workspaces: points.reduce((s, p) => s + p.workspaces, 0),
    },
    previous: {
      signups: Number(prev[0]?.signups ?? 0),
      workspaces: Number(prev[0]?.workspaces ?? 0),
    },
  }
}

export type RecentWorkspace = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  plan: string
  subscriptionStatus: string
  suspendedAt: Date | null
  createdAt: Date
  members: number
  ownerEmail: string | null
}

export async function listRecentWorkspaces(limit = 6): Promise<RecentWorkspace[]> {
  const rows = await db.execute<{
    id: string
    name: string
    slug: string
    logo_url: string | null
    plan: string
    subscription_status: string
    suspended_at: string | Date | null
    created_at: string | Date
    members: number
    owner_email: string | null
  }>(sql`
    select o.id, o.name, o.slug, o.logo_url, o.plan, o.subscription_status, o.suspended_at, o.created_at,
      (select count(*) from memberships m where m.org_id = o.id and m.status = 'active')::int as members,
      (select u.email from memberships m
         join roles r on r.id = m.role_id
         join users u on u.id = m.user_id
       where m.org_id = o.id and r.key = 'owner'
       order by m.created_at limit 1) as owner_email
    from organizations o
    order by o.created_at desc
    limit ${limit}
  `)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    logoUrl: r.logo_url,
    plan: r.plan,
    subscriptionStatus: r.subscription_status,
    suspendedAt: r.suspended_at ? new Date(r.suspended_at) : null,
    createdAt: new Date(r.created_at),
    members: Number(r.members),
    ownerEmail: r.owner_email,
  }))
}

export type ChecklistItem = {
  key: "email" | "billing" | "oauth" | "storage" | "worker"
  label: string
  description: string
  href: string
  /** done: configured · todo: needs attention · optional: not required for this instance */
  state: "done" | "todo" | "optional"
}

export async function getSetupChecklist(): Promise<ChecklistItem[]> {
  const [emailOk, emailCfg, general, billing, oauth, storage, worker] = await Promise.all([
    isEmailDeliveryConfigured(),
    getSettings("email"),
    getSettings("general"),
    getSettings("billing"),
    getSettings("oauth"),
    getSettings("storage"),
    getWorkerStatus(),
  ])

  const saas = general.mode === "saas"
  const billingReady = billing.enabled && Boolean(billing.stripeSecretKeyEnc) && Boolean(billing.priceId)
  const googleReady = oauth.google.enabled && Boolean(oauth.google.clientId && oauth.google.clientSecretEnc)
  const microsoftReady = oauth.microsoft.enabled && Boolean(oauth.microsoft.clientId && oauth.microsoft.clientSecretEnc)
  const s3Ready = Boolean(storage.s3Bucket && storage.s3AccessKeyId && storage.s3SecretEnc)
  const oauthNames = [googleReady && "Google", microsoftReady && "Microsoft"].filter(Boolean).join(" & ")

  return [
    {
      key: "email",
      label: "Email delivery",
      description: emailOk
        ? `Sending via ${emailCfg.provider === "ses" ? `Amazon SES (${emailCfg.sesRegion})` : emailCfg.host}.`
        : "Sign-in codes and invitations are only printed to the server logs.",
      href: "/admin/settings/email",
      state: emailOk ? "done" : "todo",
    },
    {
      key: "billing",
      label: "Billing",
      description: !saas
        ? "Not needed — the instance runs in private mode."
        : billingReady
          ? "Stripe subscriptions are active for hosted workspaces."
          : billing.enabled
            ? "Add the Stripe secret key and create the product & price."
            : "Enable Stripe billing to charge hosted workspaces.",
      href: "/admin/settings/billing",
      state: !saas ? "optional" : billingReady ? "done" : "todo",
    },
    {
      key: "oauth",
      label: "Google & Microsoft",
      description: oauthNames
        ? `${oauthNames} OAuth ${googleReady && microsoftReady ? "apps are" : "app is"} configured.`
        : "Optional — lets teams connect Gmail & Outlook with one click.",
      href: "/admin/settings/oauth",
      state: oauthNames ? "done" : "optional",
    },
    {
      key: "storage",
      label: "Attachment storage",
      description:
        storage.driver === "s3"
          ? s3Ready
            ? `S3-compatible bucket “${storage.s3Bucket}”.`
            : "S3 is selected but bucket or credentials are missing."
          : "Local disk in the data volume. Switch to S3 for multi-node setups.",
      href: "/admin/settings/storage",
      state: storage.driver === "s3" ? (s3Ready ? "done" : "todo") : "done",
    },
    {
      key: "worker",
      label: "Background worker",
      description: worker.online
        ? "Online — syncing inboxes and running jobs."
        : worker.reported
          ? "Offline — no heartbeat in the last 90 seconds."
          : "Has not reported yet. Start the worker container.",
      href: "/admin/system",
      state: worker.online ? "done" : "todo",
    },
  ]
}

/** Monthly recurring revenue estimate = paying workspaces × price (yearly prices normalized to months). */
export async function getRevenueEstimate(payingWorkspaces: number) {
  const [general, billing] = await Promise.all([getSettings("general"), getSettings("billing")])
  const enabled = general.mode === "saas" && billing.enabled
  const monthlyCents = billing.interval === "year" ? Math.round(billing.amount / 12) : billing.amount
  return {
    enabled,
    currency: billing.currency,
    mrrCents: enabled ? payingWorkspaces * monthlyCents : 0,
    priceCents: billing.amount,
    interval: billing.interval,
  }
}
