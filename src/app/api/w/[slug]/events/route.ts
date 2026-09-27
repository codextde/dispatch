import type { NextRequest } from "next/server"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { errorResponse, requireApiOrg } from "@/server/api"
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session"
import { subscribe } from "@/server/realtime"
import { db, schema } from "@/server/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const HEARTBEAT_MS = 20_000
const RECHECK_MS = 5 * 60_000

/**
 * GET /api/w/[slug]/events — Server-Sent Events stream of realtime events
 * for this workspace (`data: RealtimeEvent` JSON per message). Events with
 * `userIds` are only delivered to those users. Clients refetch data on events;
 * visibility is enforced by the regular API. Heartbeat comment every 20s; the
 * session and membership are re-validated every 5 minutes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let ctx: Awaited<ReturnType<typeof requireApiOrg>>
  try {
    ctx = await requireApiOrg(req, slug)
  } catch (err) {
    return errorResponse(err)
  }
  const me = ctx.user.id
  const orgId = ctx.org.id
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const encoder = new TextEncoder()
  let closed = false
  let cleanup = () => {}

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
        const { userIds: _recipients, ...payload } = event
        void _recipients
        send(`data: ${JSON.stringify(payload)}\n\n`)
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
