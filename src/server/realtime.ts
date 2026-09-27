import "server-only"
import postgres from "postgres"
import { getDatabaseUrl } from "@/server/env"
import { db } from "@/server/db"
import { sql } from "drizzle-orm"

/**
 * Realtime events via Postgres LISTEN/NOTIFY.
 *
 * Any process (web or worker) can `publish()`; each web process holds one
 * LISTEN connection and fans events out to its SSE clients
 * (see /api/w/[slug]/events). No Redis required.
 *
 * Keep payloads small (< 8KB): clients refetch data on events.
 */

export type RealtimeEvent = {
  orgId: string
  type:
    | "conversation.created"
    | "conversation.updated"
    | "conversation.deleted"
    | "message.created"
    | "message.updated"
    | "comment.created"
    | "comment.updated"
    | "draft.updated"
    | "presence"
    | "typing"
    | "notification.created"
    | "account.updated"
    | "labels.updated"
    | "task.updated"
    | "org.updated"
  conversationId?: string
  /** Restrict delivery to these users (e.g. notifications). Omit = everyone in org (subject to visibility refetch). */
  userIds?: string[]
  /** Originating user (clients may ignore their own events) */
  actorId?: string
  data?: Record<string, unknown>
}

const CHANNEL = "dispatch_events"

export async function publish(event: RealtimeEvent) {
  try {
    const payload = JSON.stringify(event)
    if (payload.length > 7900) {
      const { data: _omit, ...rest } = event
      void _omit
      await db.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(rest)})`)
      return
    }
    await db.execute(sql`select pg_notify(${CHANNEL}, ${payload})`)
  } catch (err) {
    console.error("[realtime] publish failed", err)
  }
}

type Listener = (e: RealtimeEvent) => void

const g = globalThis as unknown as {
  __dispatchRealtime?: { listeners: Set<Listener>; started: boolean; client?: postgres.Sql }
}
const state = (g.__dispatchRealtime ??= { listeners: new Set(), started: false })

async function ensureListening() {
  if (state.started) return
  state.started = true
  try {
    state.client = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} })
    await state.client.listen(CHANNEL, (payload) => {
      let event: RealtimeEvent
      try {
        event = JSON.parse(payload)
      } catch {
        return
      }
      for (const l of state.listeners) {
        try {
          l(event)
        } catch {
          /* ignore listener errors */
        }
      }
    })
  } catch (err) {
    state.started = false
    console.error("[realtime] LISTEN failed", err)
  }
}

export async function subscribe(listener: Listener): Promise<() => void> {
  await ensureListening()
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

/* ----------------------------- Presence (in-memory) ----------------------------- */

/** `composing`: false, or what the user is writing ("comment" | "reply"; `true` = unspecified) */
type Composing = boolean | "comment" | "reply"
type PresenceEntry = { userId: string; conversationId: string; composing: Composing; at: number }
const presence = ((globalThis as unknown as { __dispatchPresence?: Map<string, PresenceEntry> }).__dispatchPresence ??=
  new Map())

/** Record that a user is viewing (or composing in) a conversation. Returns current viewers. */
export function touchPresence(orgId: string, userId: string, conversationId: string, composing: Composing = false) {
  const now = Date.now()
  presence.set(`${orgId}:${userId}`, { userId, conversationId, composing, at: now })
  return getViewers(orgId, conversationId)
}

export function getViewers(orgId: string, conversationId: string) {
  const now = Date.now()
  const viewers: { userId: string; composing: Composing }[] = []
  for (const [key, p] of presence) {
    if (now - p.at > 45_000) {
      presence.delete(key)
      continue
    }
    if (key.startsWith(`${orgId}:`) && p.conversationId === conversationId) viewers.push({ userId: p.userId, composing: p.composing })
  }
  return viewers
}
