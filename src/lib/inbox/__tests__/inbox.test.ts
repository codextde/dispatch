import { describe, expect, it } from "vitest"
import { boxKey, defaultStatus, parseBox, supportsStatusFilter } from "../boxes"
import { parseSearch, hasSearchCriteria } from "../search-query"
import { renderTemplate } from "../templates"
import { applyPatch, inversePatch, stillMatches } from "../match"
import { parseAddresses, isEmail } from "../format"
import { replyDefaults, stripSubjectPrefixes } from "../reply"
import type { AccountSummary, ConversationListItem, ConversationThread, ThreadMessage } from "../types"

const UUID = "3c1d28e1-3b54-460d-96a6-886b4f4961ab"

function item(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    id: "c1",
    number: 1,
    kind: "email",
    subject: "Hello",
    snippet: "",
    status: "open",
    isSpam: false,
    isTrash: false,
    priority: false,
    snoozedUntil: null,
    accountId: UUID,
    teamId: null,
    participants: [],
    lastFrom: null,
    lastDirection: "inbound",
    messageCount: 1,
    commentCount: 0,
    hasAttachments: false,
    lastActivityAt: new Date().toISOString(),
    lastMessageAt: null,
    createdAt: new Date().toISOString(),
    unread: true,
    starred: false,
    pinned: false,
    following: false,
    assigneeIds: [],
    labelIds: [],
    hasDraft: false,
    hasScheduled: false,
    chatMemberIds: [],
    ...overrides,
  }
}

describe("boxes", () => {
  it("parses static and scoped boxes", () => {
    expect(parseBox("inbox")).toEqual({ kind: "static", id: "inbox" })
    expect(parseBox(`team.${UUID}`)).toEqual({ kind: "team", id: UUID })
    expect(parseBox(`inbox.${UUID}`)).toEqual({ kind: "account", id: UUID })
    expect(parseBox(`label.${UUID}`)).toEqual({ kind: "label", id: UUID })
    expect(parseBox("label.not-a-uuid")).toBeNull()
    expect(parseBox("settings")).toBeNull()
    expect(boxKey(parseBox(`inbox.${UUID}`)!)).toBe(`inbox.${UUID}`)
  })

  it("knows which boxes filter by status", () => {
    expect(supportsStatusFilter({ kind: "static", id: "inbox" })).toBe(true)
    expect(supportsStatusFilter({ kind: "static", id: "trash" })).toBe(false)
    expect(defaultStatus({ kind: "label", id: UUID })).toBe("all")
    expect(defaultStatus({ kind: "team", id: UUID })).toBe("open")
  })
})

describe("search query parser", () => {
  it("extracts operators and free text", () => {
    const q = parseSearch('invoice from:anna@acme.com subject:"march report" has:attachment is:unread label:Billing assignee:me before:2026-01-31')
    expect(q.text).toBe("invoice")
    expect(q.from).toEqual(["anna@acme.com"])
    expect(q.subject).toEqual(["march report"])
    expect(q.hasAttachment).toBe(true)
    expect([...q.is]).toEqual(["unread"])
    expect(q.label).toEqual(["Billing"])
    expect(q.assignee).toEqual(["me"])
    expect(q.before?.toISOString().slice(0, 10)).toBe("2026-01-31")
  })

  it("treats unknown operators as text", () => {
    const q = parseSearch("foo:bar baz")
    expect(q.text).toBe("foo:bar baz")
    expect(hasSearchCriteria(parseSearch("   "))).toBe(false)
  })
})

describe("templates", () => {
  it("renders and escapes variables", () => {
    const html = renderTemplate("Hi {{contact.first_name}}, I'm {{ user.name }} from {{org.name}} {{unknown.var}}", {
      contact: { name: "anna <b>smith</b>", email: "anna@acme.com" },
      user: { name: "Leo Park", email: "leo@x.com" },
      org: { name: "Acme & Co" },
    })
    expect(html).toBe("Hi Anna, I'm Leo Park from Acme &amp; Co ")
  })

  it("derives names from email addresses", () => {
    expect(renderTemplate("{{contact.name}}", { contact: { email: "mary.jane@x.com" } })).toBe("Mary Jane")
  })
})

describe("optimistic list helpers", () => {
  const ctx = { meId: "me", accounts: [{ id: UUID, teamId: "t1" }] }

  it("removes closed conversations from open boxes", () => {
    const closed = applyPatch(item(), { status: "closed" })
    expect(stillMatches("inbox", { status: "open" }, closed, ctx)).toBe(false)
    expect(stillMatches("all", {}, closed, ctx)).toBe(true)
    expect(stillMatches("closed", {}, closed, ctx)).toBe(true)
  })

  it("handles snooze, trash, team and assignment boxes", () => {
    const snoozed = applyPatch(item(), { snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() })
    expect(stillMatches("inbox", { status: "open" }, snoozed, ctx)).toBe(false)
    expect(stillMatches("snoozed", {}, snoozed, ctx)).toBe(true)
    expect(stillMatches("trash", {}, applyPatch(item(), { trash: true }), ctx)).toBe(true)
    expect(stillMatches("team.t1", {}, item(), ctx)).toBe(true)
    expect(stillMatches("assigned", {}, applyPatch(item(), { addAssigneeIds: ["me"] }), ctx)).toBe(true)
    expect(stillMatches("unassigned", {}, applyPatch(item(), { addAssigneeIds: ["x"] }), ctx)).toBe(false)
  })

  it("computes inverse patches for undo", () => {
    expect(inversePatch(item(), { status: "closed" })).toEqual({ status: "open" })
    expect(inversePatch(item({ labelIds: ["a"] }), { addLabelIds: ["a", "b"] })).toEqual({ removeLabelIds: ["b"] })
    expect(inversePatch(item(), { starred: false })).toBeNull()
  })
})

describe("addresses", () => {
  it("parses address lists", () => {
    expect(parseAddresses('Anna <anna@acme.com>, bob@x.io; nope')).toEqual([
      { name: "Anna", email: "anna@acme.com" },
      { name: null, email: "bob@x.io" },
    ])
    expect(isEmail("a@b.co")).toBe(true)
    expect(isEmail("a@b")).toBe(false)
  })
})

describe("reply defaults", () => {
  const account: AccountSummary = {
    id: UUID,
    name: "Support",
    email: "support@acme.com",
    fromName: null,
    aliases: ["help@acme.com"],
    color: "#000",
    provider: "demo",
    status: "active",
    lastError: null,
    teamId: null,
    ownerUserId: null,
    isPersonal: false,
    level: "reply",
    defaultSignatureId: null,
  }
  const inbound: ThreadMessage = {
    id: "m1",
    direction: "inbound",
    status: "received",
    fromName: "Anna",
    fromEmail: "anna@customer.com",
    to: [{ email: "help@acme.com" }],
    cc: [{ email: "boss@customer.com", name: "Boss" }, { email: "support@acme.com" }],
    bcc: [],
    replyTo: [],
    subject: "Re: Order problem",
    snippet: "",
    hasBody: true,
    accountId: UUID,
    authorId: null,
    messageId: "abc@customer.com",
    sendAt: null,
    sentAt: null,
    sendError: null,
    date: new Date().toISOString(),
    attachments: [],
  }
  const thread = {
    conversation: { ...item(), rawSubject: "Order problem", subject: "Order problem" },
    messages: [inbound],
    comments: [],
    events: [],
    drafts: [],
    viewers: [],
  } as unknown as ConversationThread
  const own = new Set(["support@acme.com", "help@acme.com"])

  it("replies to the sender from the address they wrote to", () => {
    const d = replyDefaults(thread, "reply", [account], own)
    expect(d.to).toEqual([{ name: "Anna", email: "anna@customer.com" }])
    expect(d.cc).toEqual([])
    expect(d.fromEmail).toBe("help@acme.com")
    expect(d.subject).toBe("Re: Order problem")
    expect(d.replyToMessageId).toBe("m1")
  })

  it("reply all keeps other recipients but not our own addresses", () => {
    const d = replyDefaults(thread, "reply_all", [account], own)
    expect(d.cc).toEqual([{ email: "boss@customer.com", name: "Boss" }])
  })

  it("forward clears recipients", () => {
    const d = replyDefaults(thread, "forward", [account], own)
    expect(d.to).toEqual([])
    expect(d.subject).toBe("Fwd: Order problem")
    expect(stripSubjectPrefixes("RE: Fwd: AW: Hi")).toBe("Hi")
  })
})
