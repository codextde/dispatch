"use client"

import {
  AtSign,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  Clock,
  FilePen,
  Inbox,
  Layers,
  Mail,
  MessagesSquare,
  Search,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react"
import { parseBox, STATIC_BOX_META, type StaticBox } from "@/lib/inbox/boxes"
import { useInbox } from "./inbox-provider"

export const STATIC_BOX_ICONS: Record<StaticBox, LucideIcon> = {
  inbox: Inbox,
  assigned: UserCheck,
  mentions: AtSign,
  starred: Star,
  snoozed: Clock,
  drafts: FilePen,
  scheduled: CalendarClock,
  sent: Send,
  unassigned: CircleDashed,
  all: Layers,
  closed: CircleCheck,
  spam: ShieldAlert,
  trash: Trash2,
  chats: MessagesSquare,
  search: Search,
}

const EMPTY: Record<StaticBox, { title: string; description: string }> = {
  inbox: { title: "Inbox zero", description: "You're all caught up. New mail in your personal inboxes, assignments and mentions land here." },
  assigned: { title: "Nothing assigned to you", description: "Conversations assigned to you show up here until they are closed." },
  mentions: { title: "No mentions", description: "When a teammate @mentions you in a comment, the conversation appears here." },
  starred: { title: "No starred conversations", description: "Star important conversations with S to find them quickly." },
  snoozed: { title: "Nothing snoozed", description: "Snooze a conversation with H and it will come back when you need it." },
  drafts: { title: "No drafts", description: "Replies you start and don't send are saved here automatically." },
  scheduled: { title: "Nothing scheduled", description: "Use “Send later” in the composer to schedule a message." },
  sent: { title: "Nothing sent yet", description: "Conversations you replied to or started appear here." },
  unassigned: { title: "Everything has an owner", description: "Open conversations without an assignee show up here." },
  all: { title: "No conversations yet", description: "Connect an inbox to start receiving email." },
  closed: { title: "Nothing closed yet", description: "Close conversations with E when they're done." },
  spam: { title: "No spam", description: "Conversations marked as spam are kept here." },
  trash: { title: "Trash is empty", description: "Deleted conversations stay here until you delete them permanently." },
  chats: { title: "No chats yet", description: "Start a direct message or group chat with your teammates." },
  search: { title: "No results", description: "Try different words or operators like from:, has:attachment or is:unread." },
}

export type BoxInfo = { title: string; description: string; icon: LucideIcon; color?: string; empty: { title: string; description: string } }

export function useBoxInfo(box: string): BoxInfo {
  const { team, account, label } = useInbox()
  const parsed = parseBox(box)
  if (!parsed) return { title: "Inbox", description: "", icon: Inbox, empty: EMPTY.inbox }
  switch (parsed.kind) {
    case "static":
      return { ...STATIC_BOX_META[parsed.id], icon: STATIC_BOX_ICONS[parsed.id], empty: EMPTY[parsed.id] }
    case "team": {
      const t = team(parsed.id)
      const name = t?.name ?? "Team"
      return {
        title: name,
        description: "Open conversations routed to this team",
        icon: Users,
        color: t?.color,
        empty: { title: `Nothing open for ${name}`, description: "New conversations for this team will show up here." },
      }
    }
    case "account": {
      const a = account(parsed.id)
      const name = a?.name ?? "Inbox"
      return {
        title: name,
        description: a?.email ?? "",
        icon: Mail,
        color: a?.color,
        empty: { title: `${name} is clear`, description: "There are no open conversations in this inbox." },
      }
    }
    case "label": {
      const l = label(parsed.id)
      const name = l?.name ?? "Label"
      return {
        title: name,
        description: "Conversations with this label",
        icon: Tag,
        color: l?.color,
        empty: { title: `Nothing labeled ${name}`, description: "Add labels with L to organize conversations." },
      }
    }
  }
}
