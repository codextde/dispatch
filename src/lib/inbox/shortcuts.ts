/**
 * Keyboard shortcut schemes of the inbox (user preference `shortcuts`:
 * "dispatch" | "gmail" | "off"). One table drives the key handlers and the
 * "?" help dialog, so they never disagree.
 *
 * Key syntax: see src/hooks/inbox/use-hotkeys.ts ("j", "shift+u", "mod+k", "g i").
 */
export type ShortcutScheme = "dispatch" | "gmail"

export type ShortcutAction =
  | "next"
  | "prev"
  | "open"
  | "back"
  | "search"
  | "goInbox"
  | "goAssigned"
  | "goStarred"
  | "goDrafts"
  | "goMentions"
  | "goChats"
  | "goTeam"
  | "goSent"
  | "goAll"
  | "close"
  | "reply"
  | "replyAll"
  | "forward"
  | "comment"
  | "star"
  | "snooze"
  | "label"
  | "assign"
  | "assignMe"
  | "moveTeam"
  | "priority"
  | "mute"
  | "markRead"
  | "markUnread"
  | "trash"
  | "spam"
  | "select"
  | "selectAll"
  | "compose"
  | "newChat"
  | "help"

export type ShortcutGroup = "Navigation" | "Conversation" | "General"

type Definition = { label: string; group: ShortcutGroup; dispatch: string[]; gmail: string[] }

export const SHORTCUTS: Record<ShortcutAction, Definition> = {
  next: { label: "Next conversation", group: "Navigation", dispatch: ["j", "ArrowDown"], gmail: ["j", "ArrowDown"] },
  prev: { label: "Previous conversation", group: "Navigation", dispatch: ["k", "ArrowUp"], gmail: ["k", "ArrowUp"] },
  open: { label: "Open conversation", group: "Navigation", dispatch: ["Enter", "o"], gmail: ["o", "Enter"] },
  back: { label: "Back to the list", group: "Navigation", dispatch: ["Escape"], gmail: ["u", "Escape"] },
  search: { label: "Search & commands", group: "Navigation", dispatch: ["/", "mod+k"], gmail: ["/", "mod+k"] },
  goInbox: { label: "Go to Inbox", group: "Navigation", dispatch: ["g i"], gmail: ["g i"] },
  goAssigned: { label: "Go to Assigned to me", group: "Navigation", dispatch: ["g a"], gmail: [] },
  goStarred: { label: "Go to Starred", group: "Navigation", dispatch: ["g s"], gmail: ["g s"] },
  goDrafts: { label: "Go to Drafts", group: "Navigation", dispatch: ["g d"], gmail: ["g d"] },
  goMentions: { label: "Go to Mentions", group: "Navigation", dispatch: ["g m"], gmail: [] },
  goChats: { label: "Go to Chats", group: "Navigation", dispatch: ["g c"], gmail: ["g c"] },
  goTeam: { label: "Go to your team", group: "Navigation", dispatch: ["g t"], gmail: [] },
  goSent: { label: "Go to Sent", group: "Navigation", dispatch: [], gmail: ["g t"] },
  goAll: { label: "Go to All conversations", group: "Navigation", dispatch: [], gmail: ["g a"] },
  close: { label: "Close / reopen", group: "Conversation", dispatch: ["e"], gmail: ["e"] },
  reply: { label: "Reply", group: "Conversation", dispatch: ["r"], gmail: ["r"] },
  replyAll: { label: "Reply all", group: "Conversation", dispatch: ["a"], gmail: ["a"] },
  forward: { label: "Forward", group: "Conversation", dispatch: ["f"], gmail: ["f"] },
  comment: { label: "Comment", group: "Conversation", dispatch: ["c"], gmail: ["shift+c"] },
  star: { label: "Star", group: "Conversation", dispatch: ["s"], gmail: ["s"] },
  snooze: { label: "Snooze", group: "Conversation", dispatch: ["h"], gmail: ["b"] },
  label: { label: "Labels", group: "Conversation", dispatch: ["l"], gmail: ["l"] },
  assign: { label: "Assign", group: "Conversation", dispatch: ["i"], gmail: ["shift+a"] },
  assignMe: { label: "Assign to me", group: "Conversation", dispatch: ["m"], gmail: [] },
  moveTeam: { label: "Move to team", group: "Conversation", dispatch: [], gmail: ["v"] },
  priority: { label: "Toggle priority", group: "Conversation", dispatch: ["shift+p"], gmail: ["shift+p"] },
  mute: { label: "Mute notifications", group: "Conversation", dispatch: [], gmail: ["m"] },
  markRead: { label: "Mark as read", group: "Conversation", dispatch: [], gmail: ["shift+i"] },
  markUnread: { label: "Mark as unread", group: "Conversation", dispatch: ["u"], gmail: ["shift+u"] },
  trash: { label: "Move to trash", group: "Conversation", dispatch: ["#"], gmail: ["#"] },
  spam: { label: "Mark as spam", group: "Conversation", dispatch: ["!"], gmail: ["!"] },
  select: { label: "Select", group: "Conversation", dispatch: ["x"], gmail: ["x"] },
  selectAll: { label: "Select all", group: "Conversation", dispatch: ["mod+a"], gmail: ["mod+a"] },
  compose: { label: "New message", group: "General", dispatch: ["n"], gmail: ["c"] },
  newChat: { label: "New chat", group: "General", dispatch: ["mod+shift+n"], gmail: ["mod+shift+n"] },
  help: { label: "Keyboard shortcuts", group: "General", dispatch: ["?"], gmail: ["?"] },
}

export function keysFor(scheme: ShortcutScheme, action: ShortcutAction): string[] {
  return SHORTCUTS[action][scheme]
}

/** Primary key of an action for hints (e.g. the "N" next to Compose), or null if unbound. */
export function primaryKey(scheme: ShortcutScheme, action: ShortcutAction): string | null {
  return SHORTCUTS[action][scheme][0] ?? null
}

export function schemeFromPreference(value: unknown): { enabled: boolean; scheme: ShortcutScheme } {
  if (value === "off") return { enabled: false, scheme: "dispatch" }
  return { enabled: true, scheme: value === "gmail" ? "gmail" : "dispatch" }
}
