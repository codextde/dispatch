import "server-only"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { fail } from "@/server/workspace/context"
import { isEmptyRichText, sanitizeRichText } from "@/server/workspace/html"
import { filterOrgIds } from "@/server/workspace/queries/common"

/**
 * Canned responses. Scopes:
 *  - personal:  ownerUserId = member (everyone can manage their own)
 *  - team:      ownerUserId null, teamId set (needs responses.manage)
 *  - workspace: ownerUserId null, teamId null (needs responses.manage)
 * Shortcuts are stored without the leading slash, lowercase.
 */

export type ResponseCtx = Pick<OrgContext, "org" | "user" | "permissions">
export type ResponseScope = "personal" | "team" | "workspace"
type ResponseRow = typeof schema.cannedResponses.$inferSelect

export type ResponseInput = {
  name: string
  subject: string | null
  shortcut: string | null
  body: string
  scope: ResponseScope
  teamId: string | null
}

export const SHORTCUT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/

export function normalizeShortcut(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^\/+/, "").toLowerCase()
  if (!v) return null
  if (!SHORTCUT_RE.test(v)) fail("Shortcuts use letters, numbers, - and _ (up to 32 characters).")
  return v
}

export function scopeOf(row: Pick<ResponseRow, "ownerUserId" | "teamId">): ResponseScope {
  if (row.ownerUserId) return "personal"
  return row.teamId ? "team" : "workspace"
}

function assertCanUseScope(ctx: ResponseCtx, scope: ResponseScope) {
  if (scope !== "personal" && !ctx.permissions.has("responses.manage")) {
    fail("You don't have permission to manage shared responses.", 403)
  }
}

export async function getEditableResponse(ctx: ResponseCtx, id: string): Promise<ResponseRow> {
  const row = await db.query.cannedResponses.findFirst({
    where: and(eq(schema.cannedResponses.id, id), eq(schema.cannedResponses.orgId, ctx.org.id)),
  })
  if (!row) fail("Response not found.", 404)
  if (row.ownerUserId) {
    if (row.ownerUserId !== ctx.user.id) fail("Response not found.", 404)
  } else assertCanUseScope(ctx, scopeOf(row))
  return row
}

async function prepare(ctx: ResponseCtx, input: ResponseInput, exceptId?: string) {
  assertCanUseScope(ctx, input.scope)
  const body = sanitizeRichText(input.body)
  if (isEmptyRichText(body)) fail("The response can't be empty.")
  if (body.length > 100_000) fail("The response is too long.")

  let teamId: string | null = null
  if (input.scope === "team") {
    if (!input.teamId) fail("Choose a team for this response.")
    const [valid] = await filterOrgIds("teams", ctx.org.id, [input.teamId])
    if (!valid) fail("That team doesn't exist in this workspace.")
    teamId = valid
  }

  const shortcut = normalizeShortcut(input.shortcut)
  if (shortcut) {
    const r = schema.cannedResponses
    // Shared shortcuts are unique among shared responses; personal ones must not clash with yours or shared ones
    const clash = await db.query.cannedResponses.findFirst({
      columns: { id: true, name: true },
      where: and(
        eq(r.orgId, ctx.org.id),
        sql`lower(${r.shortcut}) = ${shortcut}`,
        exceptId ? ne(r.id, exceptId) : undefined,
        input.scope === "personal" ? sql`(${r.ownerUserId} is null or ${r.ownerUserId} = ${ctx.user.id})` : isNull(r.ownerUserId)
      ),
    })
    if (clash) fail(`The shortcut /${shortcut} is already used by “${clash.name}”.`)
  }

  return {
    name: input.name.trim(),
    subject: input.subject?.trim() || null,
    shortcut,
    body,
    ownerUserId: input.scope === "personal" ? ctx.user.id : null,
    teamId,
  }
}

export async function createResponseService(ctx: ResponseCtx, input: ResponseInput): Promise<ResponseRow> {
  const values = await prepare(ctx, input)
  const [row] = await db
    .insert(schema.cannedResponses)
    .values({ ...values, orgId: ctx.org.id, createdBy: ctx.user.id })
    .returning()
  return row!
}

export async function updateResponseService(
  ctx: ResponseCtx,
  id: string,
  input: ResponseInput
): Promise<{ row: ResponseRow; before: ResponseRow }> {
  const before = await getEditableResponse(ctx, id)
  const values = await prepare(ctx, input, id)
  const [row] = await db
    .update(schema.cannedResponses)
    .set(values)
    .where(and(eq(schema.cannedResponses.id, id), eq(schema.cannedResponses.orgId, ctx.org.id)))
    .returning()
  return { row: row!, before }
}

export async function deleteResponseService(ctx: ResponseCtx, id: string): Promise<ResponseRow> {
  const row = await getEditableResponse(ctx, id)
  await db
    .delete(schema.cannedResponses)
    .where(and(eq(schema.cannedResponses.id, id), eq(schema.cannedResponses.orgId, ctx.org.id)))
  return row
}
