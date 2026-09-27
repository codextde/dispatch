/**
 * Dispatch database schema (PostgreSQL / Drizzle ORM).
 *
 * Multi-tenancy: every tenant-owned row carries `orgId`. A single instance can
 * host many organizations (workspaces); the instance owner ("super admin")
 * manages all of them from /admin.
 *
 * Conventions:
 *  - uuid primary keys (gen_random_uuid)
 *  - timestamps are `timestamp with time zone`
 *  - secrets (IMAP/SMTP passwords, OAuth tokens, API keys for providers) are
 *    stored encrypted via `@/server/crypto` (AES-256-GCM) in `*Enc` columns
 */
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

const id = () => uuid("id").primaryKey().defaultRandom()
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const ts = (name: string) => timestamp(name, { withTimezone: true })

/* -------------------------------------------------------------------------- */
/*                                   Enums                                    */
/* -------------------------------------------------------------------------- */

export const userStatusEnum = pgEnum("user_status", ["active", "disabled"])
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended"])
export const orgPlanEnum = pgEnum("org_plan", ["self_hosted", "free", "cloud", "comped"])
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
])
export const accountProviderEnum = pgEnum("account_provider", ["imap", "gmail", "outlook", "demo"])
export const accountStatusEnum = pgEnum("account_status", [
  "pending",
  "syncing",
  "active",
  "error",
  "paused",
])
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "closed"])
export const conversationKindEnum = pgEnum("conversation_kind", ["email", "chat"])
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"])
export const messageStatusEnum = pgEnum("message_status", [
  "draft",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "failed",
  "received",
])
export const labelVisibilityEnum = pgEnum("label_visibility", ["shared", "private"])
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "done"])
export const accessLevelEnum = pgEnum("access_level", ["read", "reply", "manage"])
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
])

/* -------------------------------------------------------------------------- */
/*                              Instance-level                                */
/* -------------------------------------------------------------------------- */

/**
 * Key/value store for instance configuration managed in the super admin panel.
 * Values are JSON. Secret values are encrypted strings inside the JSON.
 * Keys: "general", "email", "auth", "billing", "oauth", "storage", "ai",
 *       "branding", "security", "legal", "setup"
 */
export const instanceSettings = pgTable("instance_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by"),
})

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    status: userStatusEnum("status").notNull().default("active"),
    timezone: text("timezone"),
    locale: text("locale"),
    /** UI & notification preferences (theme, density, shortcuts, notifications ...) */
    preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
    /** Out-of-office */
    awayUntil: ts("away_until"),
    awayMessage: text("away_message"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)]
)

export type UserPreferences = {
  theme?: "light" | "dark" | "system"
  density?: "comfortable" | "compact"
  shortcuts?: "dispatch" | "gmail" | "off"
  sendAndArchive?: boolean
  undoSendSeconds?: number
  loadRemoteImages?: "always" | "ask" | "never"
  notifications?: {
    email?: boolean
    desktop?: boolean
    mentions?: boolean
    assignments?: boolean
    newMessages?: "all" | "assigned" | "none"
  }
  lastOrgSlug?: string
}

/** One row per signed-in device. Sessions are valid for 1 year and can be revoked. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    deviceLabel: text("device_label"),
    /** When impersonating, the super admin's own user id */
    impersonatorId: uuid("impersonator_id"),
    createdAt: createdAt(),
    lastUsedAt: ts("last_used_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [uniqueIndex("sessions_token_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]
)

/** Magic-link / one-time-code login tokens (hashed, single use, short lived). */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: id(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    redirectTo: text("redirect_to"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
  },
  (t) => [uniqueIndex("login_tokens_token_idx").on(t.tokenHash), index("login_tokens_email_idx").on(t.email)]
)

/** Fixed-window rate limiting, shared by all app instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
})

/* -------------------------------------------------------------------------- */
/*                               Organizations                                */
/* -------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    plan: orgPlanEnum("plan").notNull().default("self_hosted"),
    subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("none"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    trialEndsAt: ts("trial_ends_at"),
    currentPeriodEndsAt: ts("current_period_ends_at"),
    /** Workspace settings (see OrgSettings) */
    settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
    /** Counter used to allocate conversation numbers (#1, #2 ...) */
    conversationSeq: integer("conversation_seq").notNull().default(0),
    onboardingCompletedAt: ts("onboarding_completed_at"),
    suspendedAt: ts("suspended_at"),
    suspendedReason: text("suspended_reason"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_idx").on(t.slug)]
)

export type OrgSettings = {
  timezone?: string
  /** Allowed email domains for auto-join (e.g. ["acme.com"]) */
  allowedDomains?: string[]
  autoJoinDomains?: boolean
  defaultRoleId?: string
  /** Conversation behaviour */
  closeOnReply?: boolean
  reopenOnReply?: boolean
  undoSendSeconds?: number
  /** Workload balancing default strategy for team auto-assignment */
  assignmentStrategy?: "none" | "round_robin" | "least_busy" | "random"
  /** Security */
  requireDomainForInvites?: boolean
  ipAllowlist?: string[]
  sessionMaxDays?: number
  /** AI (optional BYO key overrides instance defaults) */
  ai?: {
    enabled?: boolean
    provider?: "anthropic" | "openai"
    model?: string
    apiKeyEnc?: string
    baseUrl?: string
  }
  branding?: { accentColor?: string }
  businessHours?: { enabled?: boolean; days?: number[]; start?: string; end?: string }
}

/**
 * Roles are per-organization. System roles (owner/admin/member/guest) are
 * created with every org and cannot be deleted; custom roles can be added.
 */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key"), // "owner" | "admin" | "member" | "guest" for system roles
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("roles_org_idx").on(t.orgId), uniqueIndex("roles_org_key_idx").on(t.orgId, t.key)]
)

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    title: text("title"),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ]
)

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    teamIds: uuid("team_ids").array().notNull().default(sql`'{}'::uuid[]`),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("invitations_token_idx").on(t.tokenHash), index("invitations_org_idx").on(t.orgId)]
)

export const teams = pgTable(
  "teams",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#22c55e"),
    icon: text("icon"),
    /** Workload balancing for conversations routed to this team */
    assignmentStrategy: text("assignment_strategy").notNull().default("none"),
    lastAssignedUserId: uuid("last_assigned_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("teams_org_idx").on(t.orgId)]
)

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)]
)

/* -------------------------------------------------------------------------- */
/*                         Email accounts ("inboxes")                         */
/* -------------------------------------------------------------------------- */

/**
 * A connected mailbox. `ownerUserId` set => personal account (private by default).
 * `ownerUserId` null => shared inbox, visible to everyone in `accountAccess`.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    provider: accountProviderEnum("provider").notNull().default("imap"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    fromName: text("from_name"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    color: text("color").notNull().default("#22c55e"),
    /** Encrypted JSON: { imap: {host,port,secure,user,pass}, smtp: {...}, oauth: {...} } */
    credentialsEnc: text("credentials_enc"),
    /** Non secret connection info shown in UI */
    config: jsonb("config").$type<AccountConfig>().notNull().default({}),
    status: accountStatusEnum("status").notNull().default("pending"),
    lastError: text("last_error"),
    lastSyncedAt: ts("last_synced_at"),
    syncFromDate: ts("sync_from_date"),
    signatureId: uuid("signature_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_org_idx").on(t.orgId), index("accounts_owner_idx").on(t.ownerUserId)]
)

export type AccountConfig = {
  imapHost?: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  username?: string
  /** Mailbox paths */
  inboxPath?: string
  sentPath?: string
  archivePath?: string
  trashPath?: string
  spamPath?: string
  /** Behaviour */
  syncDays?: number
  syncArchive?: boolean
  markReadOnServer?: boolean
  saveSentCopy?: boolean
  autoCc?: string[]
  autoBcc?: string[]
}

export const accountAccess = pgTable(
  "account_access",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    level: accessLevelEnum("level").notNull().default("reply"),
    createdAt: createdAt(),
  },
  (t) => [index("account_access_account_idx").on(t.accountId)]
)

/** IMAP sync cursor per account mailbox. */
export const mailboxSyncState = pgTable(
  "mailbox_sync_state",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    mailbox: text("mailbox").notNull(),
    uidValidity: bigint("uid_validity", { mode: "number" }),
    lastUid: bigint("last_uid", { mode: "number" }).notNull().default(0),
    highestModseq: text("highest_modseq"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.mailbox] })]
)

/* -------------------------------------------------------------------------- */
/*                               Conversations                                */
/* -------------------------------------------------------------------------- */

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Short sequential-ish number for human references (#1234) */
    number: integer("number").notNull(),
    kind: conversationKindEnum("kind").notNull().default("email"),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    subject: text("subject").notNull().default(""),
    customSubject: text("custom_subject"),
    snippet: text("snippet").notNull().default(""),
    status: conversationStatusEnum("status").notNull().default("open"),
    isSpam: boolean("is_spam").notNull().default(false),
    isTrash: boolean("is_trash").notNull().default(false),
    snoozedUntil: ts("snoozed_until"),
    snoozedBy: uuid("snoozed_by"),
    priority: boolean("priority").notNull().default(false),
    /** [{ name, email }] external participants (from/to/cc aggregated) */
    participants: jsonb("participants").$type<Participant[]>().notNull().default([]),
    /** For internal chat rooms: member user ids */
    chatMemberIds: uuid("chat_member_ids").array().notNull().default(sql`'{}'::uuid[]`),
    messageCount: integer("message_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    lastMessageAt: ts("last_message_at"),
    lastInboundAt: ts("last_inbound_at"),
    lastOutboundAt: ts("last_outbound_at"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    firstResponseAt: ts("first_response_at"),
    closedAt: ts("closed_at"),
    closedBy: uuid("closed_by"),
    /** Gmail thread id / provider thread id for threading */
    providerThreadId: text("provider_thread_id"),
    mergedIntoId: uuid("merged_into_id"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversations_org_number_idx").on(t.orgId, t.number),
    index("conversations_org_activity_idx").on(t.orgId, t.lastActivityAt),
    index("conversations_account_idx").on(t.accountId),
    index("conversations_team_idx").on(t.teamId),
    index("conversations_snooze_idx").on(t.snoozedUntil),
    index("conversations_thread_idx").on(t.orgId, t.providerThreadId),
    index("conversations_search_idx").using(
      "gin",
      sql`to_tsvector('simple', coalesce(${t.subject}, '') || ' ' || coalesce(${t.snippet}, ''))`
    ),
  ]
)

export type Participant = { name?: string | null; email: string }

export const conversationAssignees = pgTable(
  "conversation_assignees",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conv_assignees_user_idx").on(t.userId)]
)

/** Per-user state of a conversation (read, starred, followed, archived-for-me). */
export const conversationUserState = pgTable(
  "conversation_user_state",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at"),
    unread: boolean("unread").notNull().default(true),
    starred: boolean("starred").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    following: boolean("following").notNull().default(false),
    muted: boolean("muted").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conv_user_state_user_idx").on(t.userId),
  ]
)

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    direction: messageDirectionEnum("direction").notNull(),
    status: messageStatusEnum("status").notNull().default("received"),
    /** RFC 5322 Message-ID (without <>) */
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references").array().notNull().default(sql`'{}'::text[]`),
    fromName: text("from_name"),
    fromEmail: text("from_email").notNull().default(""),
    to: jsonb("to").$type<Participant[]>().notNull().default([]),
    cc: jsonb("cc").$type<Participant[]>().notNull().default([]),
    bcc: jsonb("bcc").$type<Participant[]>().notNull().default([]),
    replyTo: jsonb("reply_to").$type<Participant[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    snippet: text("snippet").notNull().default(""),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    /** Outbound: who wrote it; drafts: owner */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Draft collaboration */
    isSharedDraft: boolean("is_shared_draft").notNull().default(false),
    draftVersion: integer("draft_version").notNull().default(0),
    lastEditedBy: uuid("last_edited_by"),
    /** Reply-to message for drafts (quoted) */
    replyToMessageId: uuid("reply_to_message_id"),
    /** Outbound scheduling: send_at (undo window or send later) */
    sendAt: ts("send_at"),
    sentAt: ts("sent_at"),
    receivedAt: ts("received_at"),
    sendError: text("send_error"),
    sendAttempts: integer("send_attempts").notNull().default(0),
    /** IMAP location */
    imapMailbox: text("imap_mailbox"),
    imapUid: bigint("imap_uid", { mode: "number" }),
    size: integer("size"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_org_msgid_idx").on(t.orgId, t.messageId),
    uniqueIndex("messages_account_msgid_idx").on(t.accountId, t.messageId),
    index("messages_status_send_idx").on(t.status, t.sendAt),
    index("messages_author_idx").on(t.authorId),
  ]
)

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    storageKey: text("storage_key").notNull(),
    contentId: text("content_id"),
    isInline: boolean("is_inline").notNull().default(false),
    uploadedBy: uuid("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_message_idx").on(t.messageId), index("attachments_comment_idx").on(t.commentId)]
)

/** Internal team discussion inside a conversation (or chat room messages). */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Sanitized HTML body */
    body: text("body").notNull(),
    mentions: uuid("mentions").array().notNull().default(sql`'{}'::uuid[]`),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("comments_conversation_idx").on(t.conversationId, t.createdAt)]
)

export const reactions = pgTable(
  "reactions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })]
)

/**
 * Timeline events of a conversation: assigned, unassigned, labeled, closed,
 * reopened, snoozed, moved, merged, rule_applied, subject_changed ...
 */
export const conversationEvents = pgTable(
  "conversation_events",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("conversation_events_conv_idx").on(t.conversationId, t.createdAt)]
)

/* -------------------------------------------------------------------------- */
/*                             Labels & contacts                              */
/* -------------------------------------------------------------------------- */

export const labels = pgTable(
  "labels",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    parentId: uuid("parent_id").references((): AnyPgColumn => labels.id, { onDelete: "cascade" }),
    visibility: labelVisibilityEnum("visibility").notNull().default("shared"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    /** Show label as its own mailbox in the sidebar */
    showInSidebar: boolean("show_in_sidebar").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("labels_org_idx").on(t.orgId)]
)

export const conversationLabels = pgTable(
  "conversation_labels",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.labelId] }), index("conv_labels_label_idx").on(t.labelId)]
)

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null => shared address book */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    title: text("title"),
    phone: text("phone"),
    notes: text("notes"),
    avatarUrl: text("avatar_url"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    lastContactedAt: ts("last_contacted_at"),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contacts_org_idx").on(t.orgId),
    uniqueIndex("contacts_org_email_idx").on(t.orgId, sql`lower(${t.email})`),
  ]
)

/* -------------------------------------------------------------------------- */
/*                        Productivity: responses, tasks                      */
/* -------------------------------------------------------------------------- */

export const cannedResponses = pgTable(
  "canned_responses",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null => shared with the organization (or team) */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortcut: text("shortcut"),
    subject: text("subject"),
    /** HTML with {{variables}} e.g. {{contact.first_name}}, {{user.name}} */
    body: text("body").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("canned_responses_org_idx").on(t.orgId)]
)

export const signatures = pgTable(
  "signatures",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null => managed by admins (org signature) */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** HTML with {{user.name}}, {{user.title}}, {{user.email}} */
    body: text("body").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("signatures_org_idx").on(t.orgId)]
)

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    completedAt: ts("completed_at"),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_org_idx").on(t.orgId), index("tasks_assignee_idx").on(t.assigneeId)]
)

/* -------------------------------------------------------------------------- */
/*                               Automation                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rules run when a trigger fires (incoming email, outgoing email, conversation
 * closed, ...). Conditions and actions are JSON (see `@/lib/rules`).
 */
export const rules = pgTable(
  "rules",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null => org rule; set => personal rule */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    trigger: text("trigger").notNull().default("incoming"),
    /** { match: "all" | "any", conditions: [{ field, operator, value }] } */
    conditions: jsonb("conditions").$type<RuleConditions>().notNull().default({ match: "all", conditions: [] }),
    /** [{ type, ...params }] */
    actions: jsonb("actions").$type<RuleAction[]>().notNull().default([]),
    /** Restrict to accounts (empty => all accounts in scope) */
    accountIds: uuid("account_ids").array().notNull().default(sql`'{}'::uuid[]`),
    stopProcessing: boolean("stop_processing").notNull().default(false),
    position: integer("position").notNull().default(0),
    runCount: integer("run_count").notNull().default(0),
    lastRunAt: ts("last_run_at"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rules_org_idx").on(t.orgId)]
)

export type RuleCondition = {
  field:
    | "from"
    | "to"
    | "cc"
    | "subject"
    | "body"
    | "account"
    | "has_attachment"
    | "header"
    | "label"
    | "domain"
  operator: "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "ends_with" | "matches" | "is_true" | "is_false"
  value?: string
  header?: string
}
export type RuleConditions = { match: "all" | "any"; conditions: RuleCondition[] }
export type RuleAction =
  | { type: "add_label"; labelId: string }
  | { type: "remove_label"; labelId: string }
  | { type: "assign"; userId: string }
  | { type: "assign_team"; teamId: string; balance?: boolean }
  | { type: "close" }
  | { type: "mark_spam" }
  | { type: "trash" }
  | { type: "star" }
  | { type: "priority" }
  | { type: "snooze"; minutes: number }
  | { type: "auto_reply"; cannedResponseId?: string; body?: string; subject?: string }
  | { type: "forward"; to: string }
  | { type: "comment"; body: string }
  | { type: "webhook"; url: string }
  | { type: "mark_read" }

/* -------------------------------------------------------------------------- */
/*                               Notifications                                */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** mention | assigned | reply | comment | task | reminder */
    type: text("type").notNull(),
    actorId: uuid("actor_id"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id"),
    title: text("title").notNull(),
    body: text("body"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)]
)

/* -------------------------------------------------------------------------- */
/*                           Integrations / API                               */
/* -------------------------------------------------------------------------- */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: ts("last_used_at"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash), index("api_keys_org_idx").on(t.orgId)]
)

export const webhooks = pgTable(
  "webhooks",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    secretEnc: text("secret_enc").notNull(),
    events: text("events").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    lastStatus: integer("last_status"),
    lastDeliveredAt: ts("last_delivered_at"),
    failureCount: integer("failure_count").notNull().default(0),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("webhooks_org_idx").on(t.orgId)]
)

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    createdAt: createdAt(),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [index("webhook_deliveries_pending_idx").on(t.status, t.nextAttemptAt)]
)

/* -------------------------------------------------------------------------- */
/*                                  Audit                                     */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    /** null => instance-level (super admin) event */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_org_idx").on(t.orgId, t.createdAt), index("audit_logs_created_idx").on(t.createdAt)]
)

/** Generic background jobs queue (processed by the worker). */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_pending_idx").on(t.completedAt, t.runAt)]
)

/* -------------------------------------------------------------------------- */
/*                                 Relations                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}))

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  roles: many(roles),
  teams: many(teams),
  accounts: many(accounts),
}))

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  org: one(organizations, { fields: [memberships.orgId], references: [organizations.id] }),
  role: one(roles, { fields: [memberships.roleId], references: [roles.id] }),
}))

export const rolesRelations = relations(roles, ({ one, many }) => ({
  org: one(organizations, { fields: [roles.orgId], references: [organizations.id] }),
  memberships: many(memberships),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
  org: one(organizations, { fields: [teams.orgId], references: [organizations.id] }),
  members: many(teamMembers),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}))

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  org: one(organizations, { fields: [accounts.orgId], references: [organizations.id] }),
  owner: one(users, { fields: [accounts.ownerUserId], references: [users.id] }),
  team: one(teams, { fields: [accounts.teamId], references: [teams.id] }),
  access: many(accountAccess),
}))

export const accountAccessRelations = relations(accountAccess, ({ one }) => ({
  account: one(accounts, { fields: [accountAccess.accountId], references: [accounts.id] }),
  user: one(users, { fields: [accountAccess.userId], references: [users.id] }),
  team: one(teams, { fields: [accountAccess.teamId], references: [teams.id] }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  org: one(organizations, { fields: [conversations.orgId], references: [organizations.id] }),
  account: one(accounts, { fields: [conversations.accountId], references: [accounts.id] }),
  team: one(teams, { fields: [conversations.teamId], references: [teams.id] }),
  messages: many(messages),
  comments: many(comments),
  assignees: many(conversationAssignees),
  labels: many(conversationLabels),
  events: many(conversationEvents),
  userStates: many(conversationUserState),
  tasks: many(tasks),
}))

export const conversationAssigneesRelations = relations(conversationAssignees, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationAssignees.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [conversationAssignees.userId], references: [users.id] }),
}))

export const conversationUserStateRelations = relations(conversationUserState, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationUserState.conversationId],
    references: [conversations.id],
  }),
}))

export const conversationLabelsRelations = relations(conversationLabels, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationLabels.conversationId],
    references: [conversations.id],
  }),
  label: one(labels, { fields: [conversationLabels.labelId], references: [labels.id] }),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  account: one(accounts, { fields: [messages.accountId], references: [accounts.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  attachments: many(attachments),
}))

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}))

export const commentsRelations = relations(comments, ({ one, many }) => ({
  conversation: one(conversations, { fields: [comments.conversationId], references: [conversations.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  reactions: many(reactions),
}))

export const reactionsRelations = relations(reactions, ({ one }) => ({
  comment: one(comments, { fields: [reactions.commentId], references: [comments.id] }),
  user: one(users, { fields: [reactions.userId], references: [users.id] }),
}))

export const conversationEventsRelations = relations(conversationEvents, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationEvents.conversationId],
    references: [conversations.id],
  }),
}))

export const labelsRelations = relations(labels, ({ one, many }) => ({
  parent: one(labels, { fields: [labels.parentId], references: [labels.id], relationName: "label_parent" }),
  children: many(labels, { relationName: "label_parent" }),
  conversations: many(conversationLabels),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  conversation: one(conversations, { fields: [tasks.conversationId], references: [conversations.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
}))

export const invitationsRelations = relations(invitations, ({ one }) => ({
  org: one(organizations, { fields: [invitations.orgId], references: [organizations.id] }),
  role: one(roles, { fields: [invitations.roleId], references: [roles.id] }),
}))

export type User = typeof users.$inferSelect
export type Organization = typeof organizations.$inferSelect
export type Role = typeof roles.$inferSelect
export type Membership = typeof memberships.$inferSelect
export type Team = typeof teams.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Label = typeof labels.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type CannedResponse = typeof cannedResponses.$inferSelect
export type Signature = typeof signatures.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Rule = typeof rules.$inferSelect
export type Webhook = typeof webhooks.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
