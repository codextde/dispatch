"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { ComposingKind, NotificationPage } from "@/lib/inbox/types"
import { inboxKeys } from "./queries"

/**
 * Realtime client: one EventSource per tab on /api/w/[slug]/events.
 * Events invalidate the matching TanStack Query caches (clients refetch,
 * the API enforces visibility), feed the presence store and trigger desktop
 * notifications. Every event is also re-dispatched as a
 * `window` CustomEvent("dispatch:realtime", { detail: event }) so other
 * areas (tasks, contacts ...) can react without opening another stream.
 */
export type ClientRealtimeEvent = {
  type: string
  orgId: string
  conversationId?: string
  actorId?: string
  data?: Record<string, unknown>
}

/* --------------------------------- Presence -------------------------------- */

export type Viewer = { userId: string; composing: ComposingKind }
type PresenceState = Map<string, { viewers: Viewer[]; at: number }>

let presence: PresenceState = new Map()
const presenceListeners = new Set<() => void>()
const EMPTY: Viewer[] = []

export const presenceStore = {
  set(conversationId: string, viewers: Viewer[]) {
    presence = new Map(presence)
    presence.set(conversationId, { viewers, at: Date.now() })
    for (const l of presenceListeners) l()
  },
  setComposing(conversationId: string, userId: string, composing: ComposingKind) {
    const cur = presence.get(conversationId)?.viewers ?? []
    const exists = cur.some((v) => v.userId === userId)
    const next = exists ? cur.map((v) => (v.userId === userId ? { ...v, composing } : v)) : [...cur, { userId, composing }]
    presenceStore.set(conversationId, next)
  },
  subscribe(l: () => void) {
    presenceListeners.add(l)
    return () => {
      presenceListeners.delete(l)
    }
  },
}

export function useViewers(conversationId: string | null): Viewer[] {
  return useSyncExternalStore(
    presenceStore.subscribe,
    () => (conversationId ? (presence.get(conversationId)?.viewers ?? EMPTY) : EMPTY),
    () => EMPTY
  )
}

/* -------------------------------- Connection ------------------------------- */

type NotificationPrefs = { desktop?: boolean; mentions?: boolean; assignments?: boolean }

export function useRealtime(slug: string, opts: { meId: string; notificationPrefs?: NotificationPrefs; onOpenConversation?: (id: string) => void }) {
  const qc = useQueryClient()
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let countsTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let disconnectedAt: number | null = null
    let closed = false
    const startedAt = Date.now()
    const notified = new Set<string>()

    const pending = { lists: false, counts: false, bootstrap: false, chats: false, notifications: false, tasks: false, contacts: false, threads: new Set<string>(), allThreads: false }
    const flush = () => {
      flushTimer = null
      if (pending.lists) void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      if (pending.counts) {
        // Unread counts are the most expensive query: refresh at most every 2 seconds.
        countsTimer ??= setTimeout(() => {
          countsTimer = null
          void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
        }, 2000)
      }
      if (pending.bootstrap) void qc.invalidateQueries({ queryKey: inboxKeys.bootstrap(slug) })
      if (pending.chats) void qc.invalidateQueries({ queryKey: inboxKeys.chats(slug) })
      // Query keys owned by the tasks / contacts areas (embedded in the conversation sidebar).
      if (pending.tasks) void qc.invalidateQueries({ queryKey: ["tasks", slug] })
      if (pending.contacts) void qc.invalidateQueries({ queryKey: ["contacts", slug] })
      if (pending.notifications) void qc.invalidateQueries({ queryKey: inboxKeys.notifications(slug) })
      if (pending.allThreads) void qc.invalidateQueries({ queryKey: inboxKeys.threads(slug) })
      else for (const id of pending.threads) void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, id) })
      pending.lists = pending.counts = pending.bootstrap = pending.chats = pending.notifications = pending.tasks = pending.contacts = pending.allThreads = false
      pending.threads.clear()
    }
    const schedule = () => {
      flushTimer ??= setTimeout(flush, 250)
    }

    const desktopNotify = async () => {
      const prefs = optsRef.current.notificationPrefs
      if (prefs?.desktop === false || typeof Notification === "undefined" || Notification.permission !== "granted") return
      try {
        const page = await api.get<NotificationPage>(`/api/w/${slug}/notifications?limit=5&unread=1`)
        for (const n of page.items) {
          if (notified.has(n.id) || new Date(n.createdAt).getTime() < startedAt - 5_000) continue
          notified.add(n.id)
          if (n.type === "mention" && prefs?.mentions === false) continue
          if (n.type === "assigned" && prefs?.assignments === false) continue
          if (!["mention", "assigned", "chat"].includes(n.type)) continue
          if (document.visibilityState === "visible" && document.hasFocus()) continue
          const notification = new Notification(n.title, { body: n.body ?? undefined, tag: n.id, icon: "/icon.svg" })
          notification.onclick = () => {
            window.focus()
            if (n.conversationId) optsRef.current.onOpenConversation?.(n.conversationId)
            notification.close()
          }
        }
      } catch {
        /* ignore */
      }
    }

    const handle = (event: ClientRealtimeEvent) => {
      window.dispatchEvent(new CustomEvent("dispatch:realtime", { detail: event }))
      const cid = event.conversationId
      switch (event.type) {
        case "presence": {
          const viewers = (event.data?.viewers as Viewer[] | undefined) ?? []
          if (cid) presenceStore.set(cid, viewers)
          return
        }
        case "typing": {
          const userId = event.data?.userId as string | undefined
          if (cid && userId) presenceStore.setComposing(cid, userId, (event.data?.composing as ComposingKind) ?? null)
          return
        }
        case "notification.created":
          pending.notifications = true
          pending.counts = true
          schedule()
          if (event.actorId !== optsRef.current.meId) void desktopNotify()
          return
        case "account.updated":
        case "labels.updated":
        case "org.updated":
          pending.bootstrap = true
          pending.lists = true
          schedule()
          return
        case "draft.updated":
          if (cid) pending.threads.add(cid)
          pending.counts = true
          if (event.actorId === optsRef.current.meId) pending.lists = true
          schedule()
          return
        case "task.updated":
          pending.tasks = true
          schedule()
          return
        default:
          // conversation.* / message.* / comment.*
          pending.lists = true
          pending.counts = true
          if (cid) pending.threads.add(cid)
          else pending.allThreads = true
          if (event.type.startsWith("conversation.") || event.type.startsWith("comment.")) pending.chats = true
          if (event.type.startsWith("message.") || event.type === "conversation.created") pending.contacts = true
          schedule()
      }
    }

    const connect = () => {
      if (closed) return
      es = new EventSource(`/api/w/${slug}/events`)
      es.onopen = () => {
        attempts = 0
        if (disconnectedAt) {
          // We may have missed events while offline: refresh everything.
          disconnectedAt = null
          void qc.invalidateQueries({ queryKey: inboxKeys.all(slug) })
        }
      }
      es.onmessage = (msg) => {
        try {
          handle(JSON.parse(msg.data) as ClientRealtimeEvent)
        } catch {
          /* ignore malformed */
        }
      }
      es.addEventListener("logout", () => {
        window.location.replace(new URL(`/login?next=${encodeURIComponent(window.location.pathname)}`, window.location.origin).toString())
      })
      es.onerror = () => {
        disconnectedAt ??= Date.now()
        if (es?.readyState === EventSource.CLOSED) {
          es.close()
          es = null
          const delay = Math.min(30_000, 1000 * 2 ** attempts++)
          retryTimer = setTimeout(connect, delay)
        }
      }
    }
    connect()

    const onVisible = () => {
      if (document.visibilityState === "visible" && !es && !retryTimer) connect()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      closed = true
      document.removeEventListener("visibilitychange", onVisible)
      if (retryTimer) clearTimeout(retryTimer)
      if (flushTimer) clearTimeout(flushTimer)
      if (countsTimer) clearTimeout(countsTimer)
      es?.close()
    }
  }, [qc, slug])
}

/** Keep the server informed that I am viewing (or writing in) a conversation. */
export function usePresenceHeartbeat(slug: string, conversationId: string | null, composing: ComposingKind) {
  const lastSent = useRef<{ id: string | null; composing: ComposingKind }>({ id: null, composing: null })

  useEffect(() => {
    if (!conversationId) return
    let stopped = false
    const send = async () => {
      try {
        const res = await api.post<{ viewers: Viewer[] }>(`/api/w/${slug}/presence`, {
          conversationId,
          composing: lastSent.current.composing,
        })
        if (!stopped) presenceStore.set(conversationId, res.viewers)
      } catch {
        /* offline / no access */
      }
    }
    lastSent.current = { id: conversationId, composing: lastSent.current.composing }
    void send()
    const timer = setInterval(send, 15_000)
    return () => {
      stopped = true
      clearInterval(timer)
      void api.post(`/api/w/${slug}/presence`, { conversationId: null, left: conversationId }).catch(() => {})
    }
  }, [slug, conversationId])

  useEffect(() => {
    if (!conversationId || lastSent.current.composing === composing) return
    lastSent.current = { id: conversationId, composing }
    void api.post(`/api/w/${slug}/presence`, { conversationId, composing }).catch(() => {})
  }, [slug, conversationId, composing])
}
