// In-memory stand-in for the Drizzle client in unit tests:
//   const state = vi.hoisted(() => ({ rows: new Map(), inserts: [] }))
//   vi.mock("@/server/db", async () => (await import("@/test/fake-db")).fakeDbModule(state))
// A select resolves to the rows stored for the table it reads from (`.from(table)`); inserts are recorded.

export type FakeDbState = { rows: Map<unknown, unknown[]>; inserts: { table: unknown; values: unknown }[] }

export async function fakeDbModule(state: FakeDbState) {
  const schema = await import("@/server/db/schema")
  const query = (table?: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "then"
            ? (resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) =>
                Promise.resolve(state.rows.get(table) ?? []).then(resolve, reject)
            : prop === "from"
              ? (from: unknown) => query(from)
              : () => query(table),
      }
    )
  const db = {
    select: () => query(),
    insert: (table: unknown) => ({ values: async (values: unknown) => void state.inserts.push({ table, values }) }),
    execute: async () => [],
  }
  return { db, schema }
}
