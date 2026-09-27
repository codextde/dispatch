import "server-only"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { fail } from "@/server/workspace/context"
import { isEmptyRichText, sanitizeRichText } from "@/server/workspace/html"

/**
 * Email signatures.
 *  - workspace signatures (ownerUserId null) need `signatures.manage` and can
 *    be the default of shared inboxes
 *  - personal signatures belong to one member and can be the default of
 *    their personal inboxes
 * The default signature of an inbox is `accounts.signatureId` (source of
 * truth); `signatures.isDefault` / `signatures.accountId` mirror it.
 */

export type SignatureCtx = Pick<OrgContext, "org" | "user" | "permissions">
export type SignatureScope = "personal" | "workspace"
type SignatureRow = typeof schema.signatures.$inferSelect

export type SignatureInput = {
  name: string
  body: string
  scope: SignatureScope
  accountIds: string[]
}

const canManage = (ctx: SignatureCtx) => ctx.permissions.has("signatures.manage")

function assertScope(ctx: SignatureCtx, scope: SignatureScope) {
  if (scope === "workspace" && !canManage(ctx)) fail("You don't have permission to manage workspace signatures.", 403)
}

export async function getEditableSignature(ctx: SignatureCtx, id: string): Promise<SignatureRow> {
  const row = await db.query.signatures.findFirst({
    where: and(eq(schema.signatures.id, id), eq(schema.signatures.orgId, ctx.org.id)),
  })
  if (!row) fail("Signature not found.", 404)
  if (row.ownerUserId) {
    if (row.ownerUserId !== ctx.user.id) fail("Signature not found.", 404)
  } else assertScope(ctx, "workspace")
  return row
}

function cleanBody(html: string) {
  const body = sanitizeRichText(html)
  if (isEmptyRichText(body)) fail("The signature can't be empty.")
  if (body.length > 50_000) fail("The signature is too long.")
  return body
}

/** Inboxes a signature of `scope` may be the default of. */
async function assignableAccountIds(ctx: SignatureCtx, scope: SignatureScope, tx: DbOrTx = db): Promise<Set<string>> {
  const a = schema.accounts
  const rows = await tx
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.orgId, ctx.org.id), scope === "workspace" ? isNull(a.ownerUserId) : eq(a.ownerUserId, ctx.user.id)))
  return new Set(rows.map((r) => r.id))
}

/** Re-derive signatures.isDefault / accountId from accounts.signatureId. */
export async function recomputeSignatureDefaults(orgId: string, signatureIds: string[], tx: DbOrTx = db) {
  const ids = [...new Set(signatureIds.filter(Boolean))]
  if (!ids.length) return
  const usage = await tx
    .select({ signatureId: schema.accounts.signatureId, accountId: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.orgId, orgId), inArray(schema.accounts.signatureId, ids)))
  for (const id of ids) {
    const used = usage.filter((u) => u.signatureId === id)
    await tx
      .update(schema.signatures)
      .set({ isDefault: used.length > 0, accountId: used.length === 1 ? used[0]!.accountId : null })
      .where(and(eq(schema.signatures.id, id), eq(schema.signatures.orgId, orgId)))
  }
}

/**
 * Make `signatureId` the default of exactly `accountIds` among the inboxes
 * it may be assigned to (clearing it elsewhere).
 */
async function applyAssignment(ctx: SignatureCtx, signatureId: string, scope: SignatureScope, accountIds: string[], tx: DbOrTx) {
  const allowed = await assignableAccountIds(ctx, scope, tx)
  const wanted = [...new Set(accountIds)]
  const invalid = wanted.filter((id) => !allowed.has(id))
  if (invalid.length) {
    fail(scope === "workspace" ? "Workspace signatures can only be the default of shared inboxes." : "Personal signatures can only be the default of your own inboxes.")
  }
  const a = schema.accounts
  // Signatures previously used by the inboxes we take over
  const previous = wanted.length
    ? await tx
        .select({ signatureId: a.signatureId })
        .from(a)
        .where(and(eq(a.orgId, ctx.org.id), inArray(a.id, wanted)))
    : []
  // Clear this signature from inboxes no longer selected (anywhere in the org)
  await tx
    .update(a)
    .set({ signatureId: null })
    .where(and(eq(a.orgId, ctx.org.id), eq(a.signatureId, signatureId), wanted.length ? notInArray(a.id, wanted) : sql`true`))
  if (wanted.length) {
    await tx
      .update(a)
      .set({ signatureId })
      .where(and(eq(a.orgId, ctx.org.id), inArray(a.id, wanted)))
  }
  await recomputeSignatureDefaults(ctx.org.id, [signatureId, ...previous.map((p) => p.signatureId ?? "")], tx)
}

export async function createSignatureService(ctx: SignatureCtx, input: SignatureInput): Promise<SignatureRow> {
  assertScope(ctx, input.scope)
  const body = cleanBody(input.body)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.signatures)
      .values({
        orgId: ctx.org.id,
        name: input.name.trim(),
        body,
        ownerUserId: input.scope === "personal" ? ctx.user.id : null,
      })
      .returning()
    await applyAssignment(ctx, row!.id, input.scope, input.accountIds, tx)
    return row!
  })
}

export async function updateSignatureService(
  ctx: SignatureCtx,
  id: string,
  input: SignatureInput
): Promise<{ row: SignatureRow; before: SignatureRow; previousAccountIds: string[] }> {
  const before = await getEditableSignature(ctx, id)
  const beforeScope: SignatureScope = before.ownerUserId ? "personal" : "workspace"
  // Moving between personal and workspace always involves a workspace signature
  if (beforeScope !== input.scope) assertScope(ctx, "workspace")
  assertScope(ctx, input.scope)
  const body = cleanBody(input.body)
  const previousAccountIds = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.orgId, ctx.org.id), eq(schema.accounts.signatureId, id)))
    .then((r) => r.map((x) => x.id))
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.signatures)
      .set({ name: input.name.trim(), body, ownerUserId: input.scope === "personal" ? ctx.user.id : null })
      .where(and(eq(schema.signatures.id, id), eq(schema.signatures.orgId, ctx.org.id)))
      .returning()
    await applyAssignment(ctx, id, input.scope, input.accountIds, tx)
    return updated!
  })
  return { row, before, previousAccountIds }
}

export async function deleteSignatureService(ctx: SignatureCtx, id: string): Promise<SignatureRow> {
  const row = await getEditableSignature(ctx, id)
  await db.transaction(async (tx) => {
    await tx
      .update(schema.accounts)
      .set({ signatureId: null })
      .where(and(eq(schema.accounts.orgId, ctx.org.id), eq(schema.accounts.signatureId, id)))
    await tx.delete(schema.signatures).where(and(eq(schema.signatures.id, id), eq(schema.signatures.orgId, ctx.org.id)))
  })
  return row
}
