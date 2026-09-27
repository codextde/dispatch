import type { NextRequest } from "next/server"
import { startOAuth } from "@/server/oauth/flow"

/**
 * GET /api/oauth/[provider]/start
 *   ?purpose=login&next=/w/acme/inbox
 *   ?purpose=connect&org=<slug>&shared=<0|1>&teamId=<uuid>
 * Redirects to Google / Microsoft (PKCE + signed state).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  return startOAuth(req, provider)
}
