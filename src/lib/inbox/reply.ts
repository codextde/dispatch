import type { AccountSummary, ConversationThread, DraftMode, Participant, ThreadMessage } from "./types"

const lower = (s: string) => s.trim().toLowerCase()

export function stripSubjectPrefixes(subject: string) {
  return subject.replace(/^((re|fwd?|aw|wg|sv|vs)\s*:\s*)+/i, "").trim()
}

/** The message a reply refers to: the latest inbound message, else the latest message. */
export function replyTarget(thread: ConversationThread, messageId?: string | null): ThreadMessage | undefined {
  const sent = thread.messages.filter((m) => m.status !== "draft")
  if (messageId) {
    const hit = sent.find((m) => m.id === messageId)
    if (hit) return hit
  }
  const inbound = sent.filter((m) => m.direction === "inbound")
  return inbound[inbound.length - 1] ?? sent[sent.length - 1]
}

export type ReplyDefaults = {
  accountId: string | null
  fromEmail: string
  to: Participant[]
  cc: Participant[]
  subject: string
  replyToMessageId: string | null
}

/** Default From / To / Cc / Subject for reply, reply all and forward. */
export function replyDefaults(
  thread: ConversationThread,
  mode: Exclude<DraftMode, "new">,
  accounts: AccountSummary[],
  ownAddresses: Set<string>,
  messageId?: string | null
): ReplyDefaults {
  const target = replyTarget(thread, messageId)
  const conv = thread.conversation
  const account = accounts.find((a) => a.id === conv.accountId) ?? accounts.find((a) => a.id === target?.accountId) ?? accounts[0]
  const accountAddresses = account ? [account.email, ...account.aliases] : []
  const addressedTo = target ? [...target.to, ...target.cc].map((p) => p.email) : []
  // Answer from the address the customer wrote to (To before Cc), else the account address.
  const matched = addressedTo.find((t) => accountAddresses.some((a) => lower(a) === lower(t)))
  const fromEmail = (matched && accountAddresses.find((a) => lower(a) === lower(matched))) ?? account?.email ?? ""
  const baseSubject = stripSubjectPrefixes(target?.subject || conv.rawSubject || conv.subject)

  if (mode === "forward" || !target) {
    return {
      accountId: account?.id ?? null,
      fromEmail,
      to: [],
      cc: [],
      subject: mode === "forward" ? `Fwd: ${baseSubject}` : `Re: ${baseSubject}`,
      replyToMessageId: target?.id ?? null,
    }
  }

  const isOwn = (email: string) => ownAddresses.has(lower(email))
  let to: Participant[]
  if (target.direction === "inbound") {
    to = target.replyTo.length ? target.replyTo : [{ name: target.fromName, email: target.fromEmail }]
  } else {
    to = target.to
  }
  to = to.filter((p) => !isOwn(p.email) || target.direction === "outbound")

  let cc: Participant[] = []
  if (mode === "reply_all") {
    const taken = new Set(to.map((p) => lower(p.email)))
    const pool = target.direction === "inbound" ? [...target.to, ...target.cc] : target.cc
    cc = pool.filter((p) => {
      const key = lower(p.email)
      if (taken.has(key) || isOwn(p.email)) return false
      taken.add(key)
      return true
    })
  }
  return { accountId: account?.id ?? null, fromEmail, to, cc, subject: `Re: ${baseSubject}`, replyToMessageId: target.id }
}
