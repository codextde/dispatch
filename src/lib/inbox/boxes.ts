/**
 * Mailboxes ("boxes") of the inbox UI and their semantics. Isomorphic: the
 * server builds SQL from these definitions (src/server/conversations/boxes.ts),
 * the client uses them for routing, titles and optimistic list updates.
 *
 * Every box only ever contains conversations visible to the user
 * (src/server/access.ts). "Active" below means: not spam, not trash.
 * "Awake" means: not currently snoozed (snoozedUntil is null or in the past).
 *
 *  inbox       Email conversations that are open & awake & active and
 *              - belong to one of my personal accounts, or
 *              - are assigned to me, or
 *              - are followed by me (mentions auto-follow) and unread.
 *  assigned    Open, awake, active conversations assigned to me.
 *  mentions    Active conversations in which I was @mentioned in a comment.
 *  starred     Active conversations I starred.
 *  snoozed     Active conversations snoozed until a future time.
 *  drafts      Conversations containing one of my drafts.
 *  scheduled   Conversations with a message I scheduled to send later.
 *  sent        Conversations with an outbound message written by me.
 *  unassigned  Open, awake, active conversations nobody is assigned to.
 *  all         Every active email conversation (any status, snoozed too).
 *  closed      Closed, active conversations.
 *  spam        Conversations marked as spam (not trashed).
 *  trash       Trashed conversations.
 *  chats       Internal chat rooms I am a member of.
 *  team.<id>   Open, awake, active conversations routed to the team
 *              (conversation.teamId = id, or its account belongs to the team).
 *  inbox.<id>  Open, awake, active conversations of email account <id>.
 *  label.<id>  Active conversations with label <id>.
 *  search      Full-text search results (`q` parameter).
 *
 * Unread: a conversation is unread for a user when there is no
 * `conversation_user_state` row, `lastReadAt` is null, or
 * `lastReadAt < conversations.lastActivityAt`. Opening a conversation sets
 * `lastReadAt = now()`; "mark unread" clears it. `lastActivityAt` is bumped
 * by new messages and comments only (not by assignments, labels, ...).
 *
 * Conversations whose only messages are drafts (messageCount = 0) are
 * hidden from every box except `drafts`.
 */

export const STATIC_BOXES = [
  "inbox",
  "assigned",
  "mentions",
  "starred",
  "snoozed",
  "drafts",
  "scheduled",
  "sent",
  "unassigned",
  "all",
  "closed",
  "spam",
  "trash",
  "chats",
  "search",
] as const

export type StaticBox = (typeof STATIC_BOXES)[number]
export type ParsedBox =
  | { kind: "static"; id: StaticBox }
  | { kind: "team"; id: string }
  | { kind: "account"; id: string }
  | { kind: "label"; id: string }

export type StatusFilter = "open" | "closed" | "all"
export type AssigneeFilter = "anyone" | "me" | "none" | "others"
export type SortOrder = "newest" | "oldest"

export type ListFilters = {
  status?: StatusFilter
  unread?: boolean
  assignee?: AssigneeFilter
  sort?: SortOrder
  q?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value)
}

export function parseBox(box: string | null | undefined): ParsedBox | null {
  if (!box) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(box)
  } catch {
    return null
  }
  if ((STATIC_BOXES as readonly string[]).includes(decoded)) return { kind: "static", id: decoded as StaticBox }
  const dot = decoded.indexOf(".")
  if (dot < 0) return null
  const prefix = decoded.slice(0, dot)
  const id = decoded.slice(dot + 1)
  if (!isUuid(id)) return null
  if (prefix === "team") return { kind: "team", id }
  if (prefix === "inbox") return { kind: "account", id }
  if (prefix === "label") return { kind: "label", id }
  return null
}

export function boxKey(box: ParsedBox): string {
  switch (box.kind) {
    case "static":
      return box.id
    case "team":
      return `team.${box.id}`
    case "account":
      return `inbox.${box.id}`
    case "label":
      return `label.${box.id}`
  }
}

/** Boxes whose status can be switched between open / closed / all. */
export function supportsStatusFilter(box: ParsedBox): boolean {
  if (box.kind !== "static") return true
  return box.id === "inbox" || box.id === "assigned" || box.id === "unassigned"
}

export function defaultStatus(box: ParsedBox): StatusFilter {
  if (box.kind === "label") return "all"
  return supportsStatusFilter(box) ? "open" : "all"
}

export const STATIC_BOX_META: Record<StaticBox, { title: string; description: string }> = {
  inbox: { title: "Inbox", description: "Your personal mail, assignments and mentions" },
  assigned: { title: "Assigned to me", description: "Conversations you are responsible for" },
  mentions: { title: "Mentions", description: "Conversations where teammates mentioned you" },
  starred: { title: "Starred", description: "Conversations you starred" },
  snoozed: { title: "Snoozed", description: "Conversations that will come back later" },
  drafts: { title: "Drafts", description: "Replies and messages you have not sent yet" },
  scheduled: { title: "Scheduled", description: "Messages scheduled to be sent later" },
  sent: { title: "Sent", description: "Conversations you replied to" },
  unassigned: { title: "Unassigned", description: "Open conversations nobody owns yet" },
  all: { title: "All conversations", description: "Everything you have access to" },
  closed: { title: "Closed", description: "Conversations that are done" },
  spam: { title: "Spam", description: "Conversations marked as spam" },
  trash: { title: "Trash", description: "Deleted conversations" },
  chats: { title: "Chats", description: "Internal conversations with your team" },
  search: { title: "Search", description: "Search results" },
}

/** Boxes shown with an unread badge in the sidebar. */
export const COUNTED_BOXES = ["inbox", "assigned", "mentions", "unassigned", "drafts", "scheduled", "chats"] as const

export function conversationPath(slug: string, box: string, conversationId?: string | null) {
  return `/w/${slug}/${box}${conversationId ? `/${conversationId}` : ""}`
}
