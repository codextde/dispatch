import type { NextRequest } from "next/server"
import { handleOAuthCallback } from "@/server/oauth/flow"

/** GET /api/oauth/[provider]/callback — OAuth redirect URI registered with Google / Microsoft. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  return handleOAuthCallback(req, provider)
}
