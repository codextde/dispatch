import type { NextRequest } from "next/server"
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session"
import { getObject } from "@/server/storage"
import { canViewImage, contentTypeForKey, IMAGE_KEY_RE } from "@/server/workspace/uploads"

/**
 * Serves images uploaded in settings (avatars, workspace logos). Keys are
 * unguessable and immutable; access still requires a session that shares a
 * workspace with the owner.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/w/[slug]/settings/files/[...key]">) {
  const { key: parts } = await params
  const key = parts.map(decodeURIComponent).join("/")
  if (!IMAGE_KEY_RE.test(key)) return new Response("Not found", { status: 404 })

  const session = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return new Response("Unauthorized", { status: 401 })
  if (!(await canViewImage(key, session.user))) return new Response("Not found", { status: 404 })

  const body = await getObject(key)
  if (!body) return new Response("Not found", { status: 404 })
  return new Response(body, {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
}
