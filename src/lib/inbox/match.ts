import { parseBox, supportsStatusFilter, type ListFilters } from "./boxes"
import type { AccountSummary, ConversationListItem, ConversationPatch } from "./types"

/**
 * Client-side approximation of the box semantics (src/lib/inbox/boxes.ts)
 * used for optimistic list updates: after a local change, does the item
 * still belong to the list? The server list is refetched right after, so
 * this only has to be right for the common cases.
 */
export function stillMatches(
  boxKey: string,
  filters: ListFilters,
  item: ConversationListItem,
  ctx: { meId: string; accounts: Pick<AccountSummary, "id" | "teamId">[] }
): boolean {
  const box = parseBox(boxKey)
  if (!box) return true
  const snoozed = !!item.snoozedUntil && new Date(item.snoozedUntil).getTime() > Date.now()
  const active = !item.isSpam && !item.isTrash
  const statusOk = !supportsStatusFilter(box) || !filters.status || filters.status === "all" || item.status === filters.status
  const workable = active && !snoozed && statusOk

  if (filters.assignee === "me" && !item.assigneeIds.includes(ctx.meId)) return false
  if (filters.assignee === "none" && item.assigneeIds.length) return false

  switch (box.kind) {
    case "team": {
      const accountTeam = ctx.accounts.find((a) => a.id === item.accountId)?.teamId
      return workable && (item.teamId === box.id || accountTeam === box.id)
    }
    case "account":
      return workable && item.accountId === box.id
    case "label":
      return active && statusOk && item.labelIds.includes(box.id)
    case "static":
      switch (box.id) {
        case "inbox":
        case "unassigned":
          return workable && (box.id === "inbox" || item.assigneeIds.length === 0)
        case "assigned":
          return workable && item.assigneeIds.includes(ctx.meId)
        case "closed":
          return active && item.status === "closed"
        case "all":
          return active
        case "spam":
          return item.isSpam && !item.isTrash
        case "trash":
          return item.isTrash
        case "snoozed":
          return active && snoozed
        case "starred":
          return !item.isTrash && item.starred
        default:
          return !item.isTrash
      }
  }
}

/** Apply a patch to a list item (optimistic update). */
export function applyPatch(item: ConversationListItem, patch: ConversationPatch): ConversationListItem {
  const next: ConversationListItem = { ...item }
  if (patch.status) next.status = patch.status
  if (patch.snoozedUntil !== undefined) next.snoozedUntil = patch.snoozedUntil
  if (patch.teamId !== undefined) next.teamId = patch.teamId
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.subject !== undefined) next.subject = patch.subject || item.subject
  if (patch.spam !== undefined) next.isSpam = patch.spam
  if (patch.trash !== undefined) next.isTrash = patch.trash
  if (patch.starred !== undefined) next.starred = patch.starred
  if (patch.pinned !== undefined) next.pinned = patch.pinned
  if (patch.following !== undefined) next.following = patch.following
  if (patch.read !== undefined) next.unread = !patch.read
  if (patch.assigneeIds) next.assigneeIds = [...patch.assigneeIds]
  if (patch.addAssigneeIds) next.assigneeIds = [...new Set([...next.assigneeIds, ...patch.addAssigneeIds])]
  if (patch.removeAssigneeIds) next.assigneeIds = next.assigneeIds.filter((id) => !patch.removeAssigneeIds!.includes(id))
  if (patch.labelIds) next.labelIds = [...patch.labelIds]
  if (patch.addLabelIds) next.labelIds = [...new Set([...next.labelIds, ...patch.addLabelIds])]
  if (patch.removeLabelIds) next.labelIds = next.labelIds.filter((id) => !patch.removeLabelIds!.includes(id))
  return next
}

/** The patch that undoes `patch` for an item in its previous state (for "Undo" toasts). */
export function inversePatch(prev: ConversationListItem, patch: ConversationPatch): ConversationPatch | null {
  const inv: ConversationPatch = {}
  if (patch.status && patch.status !== prev.status) inv.status = prev.status
  if (patch.snoozedUntil !== undefined) inv.snoozedUntil = prev.snoozedUntil
  if (patch.spam !== undefined && patch.spam !== prev.isSpam) inv.spam = prev.isSpam
  if (patch.trash !== undefined && patch.trash !== prev.isTrash) inv.trash = prev.isTrash
  if (patch.teamId !== undefined && patch.teamId !== prev.teamId) inv.teamId = prev.teamId
  if (patch.read !== undefined && patch.read === prev.unread) inv.read = !prev.unread
  if (patch.starred !== undefined && patch.starred !== prev.starred) inv.starred = prev.starred
  if (patch.assigneeIds || patch.addAssigneeIds || patch.removeAssigneeIds) inv.assigneeIds = prev.assigneeIds
  if (patch.labelIds || patch.addLabelIds || patch.removeLabelIds) {
    const added = (patch.addLabelIds ?? []).filter((id) => !prev.labelIds.includes(id))
    const removed = (patch.removeLabelIds ?? []).filter((id) => prev.labelIds.includes(id))
    if (patch.labelIds) inv.labelIds = prev.labelIds
    else {
      if (added.length) inv.removeLabelIds = added
      if (removed.length) inv.addLabelIds = removed
    }
  }
  return Object.keys(inv).length ? inv : null
}
