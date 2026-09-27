import type { NextRequest } from "next/server"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { errorResponse, requireApiOrg } from "@/server/api"
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session"
import { subscribe, type RealtimeEvent } from "@/server/realtime"
import { db, schema } from "@/server/db"
import { getAccountAccess, visibleConversationIds } from "@/server/access"
import { assertApiScope } from "@/server/conversations/context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const HEARTBEAT_MS = 20_000
const RECHECK_MS = 5 * 60_000
const VISIBILITY_TTL_MS = 30_000

/**
 * GET /api/w/[slug]/events — Server-Sent Events stream of realtime events
 * for this workspace (`data: RealtimeEvent` JSON per message). Events with
 * `userIds` are only delivered to those users; events about a conversation
 * only to members who can see it (cached per connection for 30s). Clients
 * refetch data on events; the regular API enforces visibility as well.
 * Heartbeat comment every 20s; the session and membership are re-validated
 * every 5 minutes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let ctx: Awaited<ReturnType<typeof requireApiOrg>>
  try {
    ctx = await requireApiOrg(req, slug)
    assertApiScope(ctx, "conversations.read")
  } catch (err) {
    return errorResponse(err)
  }
  const me = ctx.user.id
  const orgId = ctx.org.id
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const encoder = new TextEncoder()
  let closed = false
  let cleanup = () => {}

  const visibility = new Map<string, { visible: boolean; at: number }>()
  let accounts: { ids: string[]; at: number } | null = null
  const canSee = async (conversationId: string) => {
    const now = Date.now()
    const hit = visibility.get(conversationId)
    if (hit && now - hit.at < VISIBILITY_TTL_MS) return hit.visible
    if (!accounts || now - accounts.at >= VISIBILITY_TTL_MS) accounts = { ids: [...(await getAccountAccess(ctx)).keys()], at: now }
    const visible = (await visibleConversationIds(ctx, [conversationId], accounts.ids)).has(conversationId)
    if (visibility.size >= 5000) visibility.clear()
    visibility.set(conversationId, { visible, at: now })
    return visible
  }
  /** Explicitly addressed events and my own always arrive; other conversation events need visibility. */
  const deliverable = async (event: RealtimeEvent) => {
    if (!event.conversationId) return true
    if (event.userIds) {
      // Addressed to me about this conversation (assigned, mentioned...): its visibility may have changed.
      visibility.delete(event.conversationId)
      return true
    }
    if (event.actorId === me) return true
    return canSee(event.conversationId).catch(() => false)
  }
  let queue = Promise.resolve()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      send(`retry: 3000\n\n`)
      send(`event: ready\ndata: ${JSON.stringify({ userId: me, at: new Date().toISOString() })}\n\n`)

      const unsubscribe = await subscribe((event) => {
        if (event.orgId !== orgId) return
        if (event.userIds && !event.userIds.includes(me)) return
        // Chained to keep the order of events while visibility is checked.
        queue = queue.then(async () => {
          if (closed || !(await deliverable(event))) return
          const { userIds: _recipients, ...payload } = event
          void _recipients
          send(`data: ${JSON.stringify(payload)}\n\n`)
        })
      })
      const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS)
      const recheck = setInterval(async () => {
        try {
          const session =
            ctx.via === "session"
              ? await validateSessionToken(token)
              : await db.query.apiKeys.findFirst({
                  where: and(
                    eq(schema.apiKeys.id, ctx.apiKeyId!),
                    isNull(schema.apiKeys.revokedAt),
                    or(isNull(schema.apiKeys.expiresAt), gt(schema.apiKeys.expiresAt, new Date()))
                  ),
                  columns: { id: true },
                })
          const membership = session
            ? await db.query.memberships.findFirst({
                where: and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, me), eq(schema.memberships.status, "active")),
                columns: { id: true },
              })
            : null
          if (!membership) {
            send(`event: logout\ndata: {}\n\n`)
            cleanup()
          }
        } catch {
          /* transient DB error: keep the stream */
        }
      }, RECHECK_MS)

      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        clearInterval(recheck)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      if (req.signal.aborted) cleanup()
      else req.signal.addEventListener("abort", () => cleanup(), { once: true })
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
