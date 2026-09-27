import type { VisualKind } from "@/content/marketing/types"
import { cn } from "@/lib/utils"
import {
  AssignVisual,
  ChatVisual,
  CommentsVisual,
  ContactsVisual,
  DraftsVisual,
  PresenceVisual,
  TasksVisual,
} from "./collab"
import {
  AiVisual,
  ApiVisual,
  AuditVisual,
  DeliveryVisual,
  InboxVisual,
  MobileVisual,
  ProvidersVisual,
  SecurityVisual,
  SelfHostVisual,
  WebhooksVisual,
} from "./platform"
import {
  AnalyticsVisual,
  CannedVisual,
  LabelsVisual,
  RulesVisual,
  SearchVisual,
  SendLaterVisual,
  ShortcutsVisual,
  SignaturesVisual,
  SnoozeVisual,
} from "./workflow"

const visuals: Record<VisualKind, { C: () => React.ReactElement; alt: string }> = {
  inbox: { C: InboxVisual, alt: "A shared team inbox with Support, Sales and Billing inboxes and assigned conversations" },
  comments: { C: CommentsVisual, alt: "An internal comment thread under an email, with an @mention" },
  assign: { C: AssignVisual, alt: "Assigning a conversation to a teammate, showing everyone's open workload" },
  drafts: { C: DraftsVisual, alt: "A shared reply draft that a teammate just edited" },
  presence: { C: PresenceVisual, alt: "Presence avatars and a warning that a teammate is already replying" },
  rules: { C: RulesVisual, alt: "A rule: when an email arrives in billing@ and the subject contains invoice, label it and assign it" },
  canned: { C: CannedVisual, alt: "Picking a canned response with template variables from the composer" },
  labels: { C: LabelsVisual, alt: "Colored labels on a conversation and the label list with counts" },
  snooze: { C: SnoozeVisual, alt: "The snooze menu with later today, tomorrow and next Monday options" },
  sendlater: { C: SendLaterVisual, alt: "Scheduling a reply for tomorrow morning and an undo send toast" },
  chat: { C: ChatVisual, alt: "A team group chat with a link to an email conversation" },
  tasks: { C: TasksVisual, alt: "A task list with assignees, due dates and a task linked to an email" },
  analytics: { C: AnalyticsVisual, alt: "An analytics card showing median first reply time and team workload" },
  ai: { C: AiVisual, alt: "The AI assistant summarizing a thread and suggesting a reply using your own API key" },
  contacts: { C: ContactsVisual, alt: "A contact card with conversation history" },
  api: { C: ApiVisual, alt: "A REST API request and its JSON response" },
  webhooks: { C: WebhooksVisual, alt: "A webhook delivery log with signed payloads and retries" },
  security: { C: SecurityVisual, alt: "A custom role with individual permission toggles" },
  audit: { C: AuditVisual, alt: "An audit log of workspace changes" },
  mobile: { C: MobileVisual, alt: "Dispatch's inbox on a phone" },
  shortcuts: { C: ShortcutsVisual, alt: "Keyboard shortcuts for close, reply, assign, snooze, comment and the command palette" },
  signatures: { C: SignaturesVisual, alt: "An email signature chosen per team inbox" },
  search: { C: SearchVisual, alt: "Searching conversations with label and status filters" },
  selfhost: { C: SelfHostVisual, alt: "A terminal starting Dispatch with Docker Compose" },
  providers: { C: ProvidersVisual, alt: "Connecting Google, Microsoft or any IMAP/SMTP mailbox" },
  delivery: { C: DeliveryVisual, alt: "Email delivery settings set to Amazon SES, with a test email delivered" },
}

export function visualAlt(kind: VisualKind) {
  return visuals[kind].alt
}

/**
 * Renders a coded product mock. The mock itself is hidden from assistive
 * tech; a short description is exposed instead.
 */
export function FeatureVisual({
  kind,
  className,
  decorative,
}: {
  kind: VisualKind
  className?: string
  /** Hide from assistive tech entirely, e.g. inside a link that already has a name */
  decorative?: boolean
}) {
  const { C, alt } = visuals[kind]
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": alt })}
      className={cn("flex w-full items-center justify-center", className)}
    >
      <div aria-hidden className="contents">
        <C />
      </div>
    </div>
  )
}

/** A visual on a tinted, dotted stage — used in feature blocks. */
export function VisualStage({
  kind,
  className,
  size = "md",
}: {
  kind: VisualKind
  className?: string
  size?: "md" | "lg"
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface",
        size === "md" ? "min-h-[300px] p-6 sm:p-10" : "min-h-[360px] p-6 sm:min-h-[440px] sm:p-12",
        className
      )}
    >
      <div aria-hidden className="mk-dots absolute inset-0 opacity-60 mk-fade-bottom" />
      <FeatureVisual kind={kind} className={cn("relative", size === "lg" && "sm:[zoom:1.3]")} />
    </div>
  )
}
