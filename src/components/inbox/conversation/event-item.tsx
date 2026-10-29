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
import { useI18n } from "@/lib/i18n"

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [])

const ACTION_MESSAGE_KEYS: Record<string, string> = {
  add_label: "eventActionAddLabel", remove_label: "eventActionRemoveLabel", assign: "eventActionAssign", assign_team: "eventActionAssignTeam",
  close: "eventActionClose", snooze: "eventActionSnooze", star: "eventActionStar", priority: "eventActionPriority", mark_read: "eventActionRead",
  mark_spam: "eventActionSpam", trash: "eventActionTrash", auto_reply: "eventActionReply", forward: "eventActionForward", comment: "eventActionComment", webhook: "eventActionWebhook",
}

/** Human readable description of a timeline event. Tolerates event data written by rules / imports. */
export function useEventText() {
  const { t, locale } = useI18n()
  const { member, label, team, meId } = useInbox()
  const who = (id: string) => (id === meId ? t("you") : memberName(member(id)))
  const names = (ids: string[]) => ids.map(who).join(", ")

  return (e: ThreadEvent): { icon: LucideIcon; actor: string; text: React.ReactNode } => {
    const d = e.data ?? {}
    const actor = e.actorId ? (e.actorId === meId ? t("eventYou") : memberName(member(e.actorId))) : "Dispatch"
    const userIds = asArray(d.userIds ?? d.userId)
    const byReply = d.reason === "reply"
    const labelChips = () => {
      const ids = asArray(d.labelIds ?? d.labelId)
      const fallback = typeof d.labelName === "string" ? d.labelName : null
      return (
        <span className="inline-flex flex-wrap gap-1 align-middle">
          {(ids.length ? ids : [""]).map((id, i) => {
            const l = label(id)
            const name = l?.name ?? fallback ?? t("eventLabelFallback")
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
        return {
          icon: UserPlus,
          actor,
          text:
            userIds.length === 1 && userIds[0] === e.actorId ? (
              t("eventSelfAssigned")
            ) : (
              <>
                {t("eventAssigned")} {names(userIds) || (typeof d.userName === "string" ? d.userName : t("eventSomeone"))}
                {d.auto ? ` ${t("eventAutomatically")}` : ""}
              </>
            ),
        }
      case "unassigned":
        return { icon: UserMinus, actor, text: <>{t("eventUnassigned")} {names(userIds) || t("eventSomeone")}</> }
      case "labeled":
        return { icon: Tag, actor, text: <>{t("eventAdded")} {labelChips()}</> }
      case "unlabeled":
        return { icon: Tag, actor, text: <>{t("eventRemoved")} {labelChips()}</> }
      case "closed":
        return { icon: CircleCheck, actor, text: t("eventClosedConversation") }
      case "reopened":
        return { icon: RotateCcw, actor, text: t(byReply ? "eventReopenedAfterReply" : "eventReopenedConversation") }
      case "snoozed":
        return { icon: Clock, actor, text: <>{t("eventSnoozedUntil")} {untilLabel(typeof d.until === "string" ? d.until : null, locale)}</> }
      case "unsnoozed":
        return { icon: Clock, actor, text: t(byReply ? "eventSnoozeEndedReply" : e.actorId ? "eventUnsnoozed" : "eventSnoozeEnded") }
      case "moved": {
        const destinationTeam = team(typeof d.teamId === "string" ? d.teamId : null)
        return { icon: Users, actor, text: destinationTeam ? <>{t("eventMovedTo")} {destinationTeam.name}</> : t("eventRemovedTeam") }
      }
      case "merged": {
        const nums = Array.isArray(d.numbers) ? d.numbers.map(String) : []
        return { icon: GitMerge, actor, text: <>{t("eventMerged")} {nums.length ? nums.map((n) => `#${n}`).join(", ") : t("eventConversation")} {t("eventIntoThis")}</> }
      }
      case "subject_changed":
        return { icon: Pencil, actor, text: typeof d.subject === "string" && d.subject ? <>{t("eventRenamedTo")} “{d.subject}”</> : t("eventSubjectReset") }
      case "priority":
        return { icon: Flag, actor, text: t(d.value ? "eventPriorityMarked" : "eventPriorityRemoved") }
      case "spam":
        return { icon: ShieldAlert, actor, text: t("eventMarkedSpam") }
      case "not_spam":
        return { icon: ShieldCheck, actor, text: t("eventNotSpam") }
      case "trashed":
        return { icon: Trash2, actor, text: t("eventMovedTrash") }
      case "restored":
        return { icon: ArchiveRestore, actor, text: t(byReply ? "eventRestoredAfterReply" : "eventRestoredTrash") }
      case "scheduled":
        return { icon: CalendarClock, actor, text: <>{t("eventScheduledFor")} {untilLabel(typeof d.sendAt === "string" ? d.sendAt : null, locale)}</> }
      case "unscheduled":
        return { icon: CalendarClock, actor, text: t("eventScheduledCanceled") }
      case "rule_applied":
      case "rule": {
        const name = typeof d.ruleName === "string" ? d.ruleName : typeof d.name === "string" ? d.name : null
        const actions = asArray(d.actions)
        return {
          icon: Zap,
          actor: t("eventRule"),
          text: (
            <>
              {name ? <>“{name}” {t("eventRuleApplied")}</> : t("eventApplied")}
              {actions.length > 0 && <span className="text-muted-foreground/80"> · {actions.map((a) => ACTION_MESSAGE_KEYS[a] ? t(ACTION_MESSAGE_KEYS[a] as never) : a.replace(/_/g, " ")).join(", ")}</span>}
            </>
          ),
        }
      }
      case "chat_created":
        return { icon: Hash, actor, text: t("eventStartedChat") }
      case "chat_renamed":
        return { icon: Pencil, actor, text: <>{t("eventRenamedChatTo")} “{String(d.name ?? "")}"</> }
      case "chat_members_added":
        return { icon: UserPlus, actor, text: <>{t("eventAddedMembers")} {names(userIds)}</> }
      case "chat_members_removed":
        return { icon: UserMinus, actor, text: <>{t("eventRemovedMembers")} {names(userIds)}</> }
      case "chat_left":
        return { icon: UserMinus, actor, text: t("eventLeftChat") }
      default:
        return { icon: Zap, actor, text: e.type.replace(/[._]/g, " ") }
    }
  }
}

export function EventItem({ event }: { event: ThreadEvent }) {
  const describe = useEventText()
  const { locale } = useI18n()
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
            {relative(event.createdAt, locale)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{fullTime(event.createdAt, locale)}</TooltipContent>
      </Tooltip>
    </div>
  )
}
