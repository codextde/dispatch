import "server-only"
import type { ZodType } from "zod"
import { action } from "@/server/action"
import { audit } from "@/server/audit"
import { AuthError, requireSuperAdmin } from "@/server/authz"
import type { CurrentSession } from "@/server/auth/session"
import { getRequestMeta } from "@/server/request"

/**
 * Super admin guard for instance administration (/admin).
 *
 *   export const suspendWorkspace = adminAction(schema, async (input, admin) => {
 *     ...
 *     await admin.audit("admin.workspace_suspended", { targetType: "organization", targetId: id })
 *   })
 *
 * Mutations are refused while impersonating, so an impersonation session can
 * never be used to administer the instance.
 */
export type AdminActor = CurrentSession & {
  ip: string | null
  userAgent: string | null
  audit: (
    action: `admin.${string}`,
    opts?: { orgId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }
  ) => Promise<void>
}

export async function requireAdminActor(): Promise<AdminActor> {
  const s = await requireSuperAdmin()
  if (s.session.impersonatorId) throw new AuthError(403, "Stop impersonating before changing instance settings.")
  const meta = await getRequestMeta()
  return {
    ...s,
    ...meta,
    audit: (actionName, opts = {}) =>
      audit({
        orgId: opts.orgId ?? null,
        actorId: s.user.id,
        actorEmail: s.user.email,
        action: actionName,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: opts.metadata,
      }),
  }
}

/** Server action wrapper: validates input, requires a super admin, returns an ActionResult. */
export function adminAction<I, O>(schema: ZodType<I>, fn: (input: I, admin: AdminActor) => Promise<O>) {
  return action(schema, async (input: I) => fn(input, await requireAdminActor()))
}
