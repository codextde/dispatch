import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), inserts: [] as { table: unknown; values: unknown }[] }))
vi.mock("@/server/db", async () => (await import("@/test/fake-db")).fakeDbModule(state))

const { emitWebhook, WEBHOOK_EVENTS } = await import("@/server/jobs")
const { conversations, webhookDeliveries, webhooks } = await import("@/server/db/schema")

const ORG = "00000000-0000-4000-8000-000000000001"
const CONV = "00000000-0000-4000-8000-000000000002"
const hooks = [{ id: "hook-1", events: [] as string[] }]

function deliveries() {
  return state.inserts.filter((i) => i.table === webhookDeliveries)
}

describe("emitWebhook", () => {
  beforeEach(() => {
    state.rows = new Map<unknown, unknown[]>([[webhooks, hooks]])
    state.inserts = []
  })

  const conversation = (row: Record<string, unknown> | null) => state.rows.set(conversations, row ? [row] : [])

  it("never delivers events of personal-inbox conversations", async () => {
    conversation({ kind: "email", accountId: "acc-personal", ownerUserId: "user-1" })
    for (const event of WEBHOOK_EVENTS) {
      await emitWebhook(ORG, event, { conversationId: CONV }, { conversationId: CONV })
    }
    expect(deliveries()).toEqual([])
  })

  it("treats conversations without a shared inbox as private", async () => {
    conversation(null) // unknown, or in another workspace
    await emitWebhook(ORG, "comment.created", {}, { conversationId: CONV })
    conversation({ kind: "email", accountId: null, ownerUserId: null })
    await emitWebhook(ORG, "task.created", {}, { conversationId: CONV })
    conversation({ kind: "chat", accountId: null, ownerUserId: null })
    await emitWebhook(ORG, "comment.created", {}, { conversationId: CONV })
    expect(deliveries()).toEqual([])
  })

  it("delivers events of shared-inbox conversations and workspace-level events", async () => {
    conversation({ kind: "email", accountId: "acc-shared", ownerUserId: null })
    await emitWebhook(ORG, "conversation.closed", { conversationId: CONV }, { conversationId: CONV })
    await emitWebhook(ORG, "task.created", { task: { id: "t1" } })
    expect(deliveries().map((d) => (d.values as { event: string }[])[0]!.event)).toEqual(["conversation.closed", "task.created"])
  })
})
