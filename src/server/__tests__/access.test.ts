import { beforeEach, describe, expect, it, vi } from "vitest"
import { SYSTEM_ROLES } from "@/lib/permissions"

const state = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), inserts: [] as { table: unknown; values: unknown }[] }))
vi.mock("@/server/db", async () => (await import("@/test/fake-db")).fakeDbModule(state))

const { getAccountAccess } = await import("@/server/access")
const { assertApiScope } = await import("@/server/conversations/context")
const { accounts, accountAccess } = await import("@/server/db/schema")

const ME = "user-me"
const viewer = (permissions: string[]) => ({ org: { id: "org-1" }, user: { id: ME }, permissions: new Set(permissions) })

describe("getAccountAccess", () => {
  beforeEach(() => {
    state.rows = new Map<unknown, unknown[]>([
      [
        accounts,
        [
          { id: "personal", ownerUserId: ME },
          { id: "support", ownerUserId: null },
          { id: "sales", ownerUserId: null },
        ],
      ],
      [accountAccess, [{ accountId: "sales", level: "manage" }]],
    ])
  })

  it("gives owners manage on their personal inbox and grants as stored", async () => {
    const access = await getAccountAccess(viewer(["conversations.reply"]))
    expect(Object.fromEntries(access)).toEqual({ personal: "manage", sales: "manage" })
  })

  it("caps every level at read without conversations.reply", async () => {
    const access = await getAccountAccess(viewer(["inboxes.manage", "contacts.manage"]))
    expect(Object.fromEntries(access)).toEqual({ personal: "read", support: "read", sales: "read" })
  })
})

describe("assertApiScope", () => {
  const role = { permissions: SYSTEM_ROLES.member.permissions as string[] }
  const apiCtx = (scopes: string[] | null, via: "session" | "api_key" = "api_key") =>
    ({ via, role, permissions: new Set(scopes ?? role.permissions) }) as unknown as Parameters<typeof assertApiScope>[0]

  it("leaves sessions and full-access keys to their role", () => {
    expect(() => assertApiScope(apiCtx(null, "session"), "contacts.read")).not.toThrow()
    expect(() => assertApiScope(apiCtx(null), "conversations.read")).not.toThrow()
  })

  it("limits restricted keys to their scopes", () => {
    expect(() => assertApiScope(apiCtx(["contacts.manage"]), "conversations.read")).toThrow(/conversations\.read/)
    expect(() => assertApiScope(apiCtx(["tasks.manage"]), "conversations.read")).toThrow()
    expect(() => assertApiScope(apiCtx(["tasks.manage"]), "contacts.read")).toThrow()
    expect(() => assertApiScope(apiCtx(["contacts.manage"]), "contacts.read")).not.toThrow()
    expect(() => assertApiScope(apiCtx(["tasks.read"]), "tasks.read")).not.toThrow()
    expect(() => assertApiScope(apiCtx(["conversations.reply"]), "conversations.read")).not.toThrow()
  })
})
