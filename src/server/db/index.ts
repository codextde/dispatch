import "server-only"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { getDatabaseUrl } from "@/server/env"
import * as schema from "./schema"

type DB = ReturnType<typeof createDb>

function createDb() {
  const client = postgres(getDatabaseUrl(), {
    max: Number(process.env.DB_POOL_SIZE || 10),
    idle_timeout: 30,
    connect_timeout: 15,
    onnotice: () => {},
  })
  return drizzle(client, { schema, casing: undefined })
}

const globalForDb = globalThis as unknown as { __dispatchDb?: DB }

/** Singleton Drizzle client (survives HMR in development). */
export const db: DB = globalForDb.__dispatchDb ?? createDb()
if (process.env.NODE_ENV !== "production") globalForDb.__dispatchDb = db

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0]
export type DbOrTx = DB | Tx

export { schema }
