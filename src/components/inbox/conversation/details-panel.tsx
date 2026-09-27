"use client"

import { Copy, SquarePen, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/app/user-avatar"
import { ContactCard } from "@/components/contacts/contact-card"
import { ConversationTasks } from "@/components/tasks/conversation-tasks"
import { fullTime, memberName, participantName, relative } from "@/lib/inbox/format"
import type { ConversationThread } from "@/lib/inbox/types"
import { inboxUI } from "@/hooks/inbox/store"
import { useInbox } from "../inbox-provider"
import { useEventText } from "./event-item"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-4 last:border-b-0">
      <h3 className="mb-2.5 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </>
  )
}

/** Right sidebar: customer (contact card), tasks, conversation details and recent activity. */
export function DetailsPanel({ thread, onClose }: { thread: ConversationThread; onClose?: () => void }) {
  const { slug, account, team, member } = useInbox()
  const describe = useEventText()
  const conv = thread.conversation
  const isChat = conv.kind === "chat"
  const acc = account(conv.accountId)
  const tm = team(conv.teamId)
  const people = isChat ? [] : conv.participants

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold tracking-tight">Details</h2>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
            <X />
          </Button>
        )}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {people.length > 0 && (
          <Section title="Contact">
            <ContactCard slug={slug} email={people[0]!.email} name={people[0]!.name} excludeConversationId={conv.id} />
          </Section>
        )}
        {people.length > 1 && (
          <Section title="Also in this conversation">
            <ul className="space-y-3">
              {people.slice(1, 10).map((p) => (
                <li key={p.email} className="flex items-center gap-3">
                  <UserAvatar name={p.name} email={p.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{participantName(p)}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Copy ${p.email}`}
                    onClick={() => {
                      void navigator.clipboard.writeText(p.email)
                      toast.success("Email copied")
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label={`Email ${participantName(p)}`} onClick={() => inboxUI.openCompose({ to: [p] })}>
                    <SquarePen />
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!isChat && (
          <Section title="Tasks">
            <ConversationTasks slug={slug} conversationId={conv.id} />
          </Section>
        )}

        {isChat && (
          <Section title="Members">
            <ul className="space-y-2.5">
              {conv.chatMemberIds.map((id) => {
                const m = member(id)
                return (
                  <li key={id} className="flex items-center gap-2.5">
                    <UserAvatar name={m?.name} email={m?.email} src={m?.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{memberName(m, "Former member")}</span>
                    {m?.title && <span className="truncate text-xs text-muted-foreground">{m.title}</span>}
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        <Section title="Conversation">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <Row label="Number">#{conv.number}</Row>
            <Row label="Status">{conv.status === "closed" ? "Closed" : "Open"}</Row>
            {acc && (
              <Row label="Inbox">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                  {acc.name}
                </span>
              </Row>
            )}
            {tm && <Row label="Team">{tm.name}</Row>}
            <Row label="Created">
              <span title={fullTime(conv.createdAt)}>{relative(conv.createdAt)}</span>
            </Row>
            {!isChat && <Row label="Messages">{conv.messageCount}</Row>}
            <Row label="Comments">{conv.commentCount}</Row>
            {conv.firstResponseAt && (
              <Row label="First reply">
                <span title={fullTime(conv.firstResponseAt)}>{relative(conv.firstResponseAt)}</span>
              </Row>
            )}
            {conv.closedAt && (
              <Row label="Closed">
                <span title={fullTime(conv.closedAt)}>
                  {relative(conv.closedAt)}
                  {conv.closedBy ? ` by ${memberName(member(conv.closedBy))}` : ""}
                </span>
              </Row>
            )}
            <Row label="Assignees">{conv.assigneeIds.length ? conv.assigneeIds.map((id) => memberName(member(id))).join(", ") : "—"}</Row>
          </dl>
        </Section>

        {thread.events.length > 0 && (
          <Section title="Activity">
            <ol className="space-y-2.5">
              {[...thread.events]
                .reverse()
                .slice(0, 25)
                .map((e) => {
                  const { icon: Icon, actor, text } = describe(e)
                  return (
                    <li key={e.id} className="flex gap-2 text-xs">
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        <span className="font-medium text-foreground/80">{actor}</span> {text}
                        <span className="block font-mono text-[10.5px]">{relative(e.createdAt)}</span>
                      </span>
                    </li>
                  )
                })}
            </ol>
          </Section>
        )}
      </div>
    </div>
  )
}
