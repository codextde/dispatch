import "server-only"
import { ZodError, type ZodType } from "zod"
import { AuthError } from "@/server/authz"
import { ApiError } from "@/server/api"

/**
 * Server Action helper: validates input and turns thrown errors into a
 * serializable result so client components can show a toast.
 *
 *   export const createLabel = action(schema, async (input) => { ... return label })
 *   const res = await createLabel(values); if (!res.ok) toast.error(res.error)
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }

export function action<I, O>(schema: ZodType<I>, fn: (input: I) => Promise<O>) {
  return async (raw: I): Promise<ActionResult<O>> => {
    try {
      const input = schema.parse(raw)
      const data = await fn(input)
      return { ok: true, data }
    } catch (err) {
      return toActionError(err)
    }
  }
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of err.issues) fieldErrors[issue.path.join(".")] ??= issue.message
    return { ok: false, error: err.issues[0]?.message ?? "Invalid input", fieldErrors }
  }
  if (err instanceof AuthError || err instanceof ApiError) return { ok: false, error: err.message }
  // Next.js redirect()/notFound() throw special errors that must propagate
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND") throw err
  }
  console.error("[action] error", err)
  return { ok: false, error: err instanceof Error && process.env.NODE_ENV !== "production" ? err.message : "Something went wrong" }
}
