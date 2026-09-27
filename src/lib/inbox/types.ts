/**
 * Shapes returned by the inbox JSON API (`/api/w/[slug]/...`). Shared by the
 * route handlers (server) and the inbox UI (client). Dates are ISO strings.
 */

export type Participant = { name?: string | null; email: string }
export type AccessLevel = "read" | "reply" | "manage"
export type ConversationStatus = "open" | "closed"

export type MemberSummary = {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  title: string | null
  role: { key: string | null; name: string }
  lastSeenAt: string | null
}

export type TeamSummary = {
  id: string
  name: string
  color: string
  icon: string | null
  memberIds: string[]
  isMember: boolean
}

export type AccountSummary = {
  id: string
  name: string
  email: string
  fromName: string | null
  aliases: string[]
  color: string
  provider: "imap" | "gmail" | "outlook" | "demo"
  status: "pending" | "syncing" | "active" | "error" | "paused"
  lastError: string | null
  teamId: string | null
  ownerUserId: string | null
  isPersonal: boolean
  level: AccessLevel
  defaultSignatureId: string | null
}

export type LabelSummary = {
  id: string
  name: string
  color: string
  parentId: string | null
  visibility: "shared" | "private"
  position: number
  showInSidebar: boolean
  teamId: string | null
}

export type SignatureSummary = {
  id: string
  name: string
  /** Raw HTML with {{user.*}} variables (rendered client-side) */
  body: string
  accountId: string | null
  isOrg: boolean
  isDefault: boolean
}

export type ChatSummary = {
  id: string
  name: string
  memberIds: string[]
  isDirect: boolean
  unread: boolean
  lastActivityAt: string
  snippet: string
}

export type BoxCounts = Record<string, number>

export type InboxSettings = {
  undoSendSeconds: number
  remoteImages: "always" | "ask" | "never"
  closeOnReply: boolean
  maxAttachmentMb: number
}

export type Bootstrap = {
  me: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
    title: string | null
    preferences: Record<string, unknown>
  }
  members: MemberSummary[]
  teams: TeamSummary[]
  accounts: AccountSummary[]
  labels: LabelSummary[]
  signatures: SignatureSummary[]
  chats: ChatSummary[]
  counts: BoxCounts
  settings: InboxSettings
}

export type ConversationListItem = {
  id: string
  number: number
  kind: "email" | "chat"
  subject: string
  snippet: string
  status: ConversationStatus
  isSpam: boolean
  isTrash: boolean
  priority: boolean
  snoozedUntil: string | null
  accountId: string | null
  teamId: string | null
  participants: Participant[]
  /** Latest message sender (for the list "from" column) */
  lastFrom: Participant | null
  lastDirection: "inbound" | "outbound" | null
  messageCount: number
  commentCount: number
  hasAttachments: boolean
  lastActivityAt: string
  lastMessageAt: string | null
  createdAt: string
  unread: boolean
  starred: boolean
  pinned: boolean
  following: boolean
  assigneeIds: string[]
  labelIds: string[]
  hasDraft: boolean
  hasScheduled: boolean
  chatMemberIds: string[]
}

export type ConversationPage = {
  items: ConversationListItem[]
  nextCursor: string | null
}

export type AttachmentInfo = {
  id: string
  filename: string
  contentType: string
  size: number
  isInline: boolean
  url: string
}

export type ThreadMessage = {
  id: string
  direction: "inbound" | "outbound"
  status: "draft" | "scheduled" | "queued" | "sending" | "sent" | "failed" | "received"
  fromName: string | null
  fromEmail: string
  to: Participant[]
  cc: Participant[]
  bcc: Participant[]
  replyTo: Participant[]
  subject: string
  snippet: string
  /** Whether a body (HTML or text) is available */
  hasBody: boolean
  accountId: string | null
  authorId: string | null
  messageId: string | null
  sendAt: string | null
  sentAt: string | null
  sendError: string | null
  date: string
  attachments: AttachmentInfo[]
}

export type ReactionGroup = { emoji: string; userIds: string[] }

export type ThreadComment = {
  id: string
  authorId: string | null
  body: string
  mentions: string[]
  parentId: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  reactions: ReactionGroup[]
  attachments: AttachmentInfo[]
}

export type ThreadEvent = {
  id: string
  actorId: string | null
  type: string
  data: Record<string, unknown>
  createdAt: string
}

export type DraftMode = "reply" | "reply_all" | "forward" | "new"

export type DraftInfo = {
  id: string
  conversationId: string
  authorId: string | null
  isShared: boolean
  version: number
  lastEditedBy: string | null
  updatedAt: string
  mode: DraftMode
  replyToMessageId: string | null
  accountId: string | null
  fromEmail: string
  to: Participant[]
  cc: Participant[]
  bcc: Participant[]
  subject: string
  html: string
  attachments: AttachmentInfo[]
}

export type ConversationDetail = ConversationListItem & {
  rawSubject: string
  customSubject: string | null
  level: AccessLevel
  closedAt: string | null
  closedBy: string | null
  createdBy: string | null
  muted: boolean
  firstResponseAt: string | null
  mergedIntoId: string | null
}

export type ConversationThread = {
  conversation: ConversationDetail
  messages: ThreadMessage[]
  comments: ThreadComment[]
  events: ThreadEvent[]
  drafts: DraftInfo[]
  viewers: { userId: string; composing: ComposingKind }[]
}

export type ComposingKind = "comment" | "reply" | null

export type MessageBody = {
  html: string
  hasRemoteImages: boolean
  imagesLoaded: boolean
  /** Plain text or written in Dispatch: safe to render with the app theme (dark mode) */
  simple: boolean
}

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  actorId: string | null
  conversationId: string | null
  commentId: string | null
  data: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

export type NotificationPage = { items: NotificationItem[]; unreadCount: number; nextCursor: string | null }

export type CannedResponseItem = {
  id: string
  name: string
  shortcut: string | null
  subject: string | null
  body: string
  scope: "personal" | "team" | "org"
}

export type RecipientSuggestion = { name: string | null; email: string; source: "contact" | "participant" | "member" }

export type UploadResult = AttachmentInfo

/** PATCH /conversations/[id] and bulk payload (all fields optional). */
export type ConversationPatch = {
  status?: ConversationStatus
  snoozedUntil?: string | null
  teamId?: string | null
  priority?: boolean
  subject?: string | null
  spam?: boolean
  trash?: boolean
  starred?: boolean
  pinned?: boolean
  following?: boolean
  muted?: boolean
  read?: boolean
  assigneeIds?: string[]
  addAssigneeIds?: string[]
  removeAssigneeIds?: string[]
  labelIds?: string[]
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

export type SendResult = {
  message: ThreadMessage
  conversationId: string
  /** ISO time until which the send can be undone (queued) */
  undoUntil: string | null
}
