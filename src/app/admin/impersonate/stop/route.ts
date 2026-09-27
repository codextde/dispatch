import type { NextRequest } from "next/server"
import { stopImpersonation } from "@/server/admin/impersonation"

/** POST /admin/impersonate/stop — end impersonation and restore the super admin's session. */
export async function POST(req: NextRequest) {
  return stopImpersonation(req)
}
