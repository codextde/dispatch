"use client"

import {
  ArchiveRestore,
  CalendarClock,
  CircleCheck,
  Clock,
  Flag,
  GitMerge,
  Hash,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fullTime, memberName, relative, untilLabel } from "@/lib/inbox/format"
import type { ThreadEvent } from "@/lib/inbox/types"
import { useInbox } from "../inbox-provider"

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [])

/** Human readable description of a timeline event. Tolerates event data written by rules / imports. */
export function useEventText() {
  const { member, label, team, meId } = useInbox()
  const who = (id: string) => (id === meId ? "you" : memberName(member(id)))
  const names = (ids: string[]) => ids.map(who).join(", ")

  return (e: ThreadEvent): { icon: LucideIcon; actor: string; text: React.ReactNode } => {
    const d = e.data ?? {}
    const actor = e.actorId ? (e.actorId === meId ? "You" : memberName(member(e.actorId))) : "Dispatch"
    const userIds = asArray(d.userIds ?? d.userId)
    const labelChips = () => {
      const ids = asArray(d.labelIds ?? d.labelId)
      const fallback = typeof d.labelName === "string" ? d.labelName : null
      return (
        <span className="inline-flex flex-wrap gap-1 align-middle">
          {(ids.length ? ids : [""]).map((id, i) => {
            const l = label(id)
            const name = l?.name ?? fallback ?? "a label"
            const color = l?.color ?? (typeof d.color === "string" ? d.color : "#94a3b8")
            return (
              <span key={id || i} className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px] leading-4 text-foreground/80">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </span>
            )
          })}
        </span>
      )
    }
    switch (e.type) {
      case "assigned":
        return { icon: UserPlus, actor, text: userIds.length === 1 && userIds[0] === e.actorId ? "self-assigned" : <>assigned {names(userIds) || (typeof d.userName === "string" ? d.userName : "someone")}</> }
      case "unassigned":
        return { icon: UserMinus, actor, text: <>unassigned {names(userIds) || "someone"}</> }
      case "labeled":
        return { icon: Tag, actor, text: <>added {labelChips()}</> }
      case "unlabeled":
        return { icon: Tag, actor, text: <>removed {labelChips()}</> }
      case "closed":
        return { icon: CircleCheck, actor, text: "closed the conversation" }
      case "reopened":
        return { icon: RotateCcw, actor, text: "reopened the conversation" }
      case "snoozed":
        return { icon: Clock, actor, text: `snoozed until ${untilLabel(typeof d.until === "string" ? d.until : null)}` }
      case "unsnoozed":
        return { icon: Clock, actor, text: e.actorId ? "unsnoozed" : "Snooze ended" }
      case "moved": {
        const t = team(typeof d.teamId === "string" ? d.teamId : null)
        return { icon: Users, actor, text: t ? <>moved to {t.name}</> : "removed the team" }
      }
      case "merged": {
        const nums = Array.isArray(d.numbers) ? d.numbers.map(String) : []
        return { icon: GitMerge, actor, text: <>merged {nums.length ? nums.map((n) => `#${n}`).join(", ") : "a conversation"} into this one</> }
      }
      case "subject_changed":
        return { icon: Pencil, actor, text: typeof d.subject === "string" && d.subject ? <>renamed to “{d.subject}”</> : "reset the subject" }
      case "priority":
        return { icon: Flag, actor, text: d.value ? "marked as priority" : "removed priority" }
      case "spam":
        return { icon: ShieldAlert, actor, text: "marked as spam" }
      case "not_spam":
        return { icon: ShieldCheck, actor, text: "marked as not spam" }
      case "trashed":
        return { icon: Trash2, actor, text: "moved to trash" }
      case "restored":
        return { icon: ArchiveRestore, actor, text: "restored from trash" }
      case "scheduled":
        return { icon: CalendarClock, actor, text: `scheduled a message for ${untilLabel(typeof d.sendAt === "string" ? d.sendAt : null)}` }
      case "unscheduled":
        return { icon: CalendarClock, actor, text: "canceled a scheduled message" }
      case "rule_applied":
      case "rule": {
        const name = typeof d.ruleName === "string" ? d.ruleName : typeof d.name === "string" ? d.name : null
        return { icon: Zap, actor: "Rule", text: name ? <>“{name}” applied</> : "applied" }
      }
      case "chat_created":
        return { icon: Hash, actor, text: "started the chat" }
      case "chat_renamed":
        return { icon: Pencil, actor, text: <>renamed the chat to “{String(d.name ?? "")}”</> }
      case "chat_members_added":
        return { icon: UserPlus, actor, text: <>added {names(userIds)}</> }
      case "chat_members_removed":
        return { icon: UserMinus, actor, text: <>removed {names(userIds)}</> }
      case "chat_left":
        return { icon: UserMinus, actor, text: "left the chat" }
      default:
        return { icon: Zap, actor, text: e.type.replace(/[._]/g, " ") }
    }
  }
}

export function EventItem({ event }: { event: ThreadEvent }) {
  const describe = useEventText()
  const { icon: Icon, actor, text } = describe(event)
  return (
    <div className="flex items-center gap-2 py-0.5 pl-[18px] text-[12px] text-muted-foreground">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground/75">{actor}</span> {text}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <time className="shrink-0 font-mono text-[10.5px]" dateTime={event.createdAt}>
            {relative(event.createdAt)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{fullTime(event.createdAt)}</TooltipContent>
      </Tooltip>
    </div>
  )
}
