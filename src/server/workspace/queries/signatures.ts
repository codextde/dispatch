import "server-only"
import { and, asc, eq, isNull, or, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"

export type SignatureListItem = {
  id: string
  name: string
  body: string
  scope: "personal" | "workspace"
  accountIds: string[]
  updatedAt: Date
  editable: boolean
}

export type SignatureAccountOption = {
  id: string
  name: string
  email: string
  color: string
  personal: boolean
  signatureId: string | null
}

/** Workspace signatures + the member's personal ones, and the inboxes they may assign. */
export async function loadSignaturesPage(ctx: Pick<OrgContext, "org" | "user" | "permissions" | "membership">) {
  const s = schema.signatures
  const a = schema.accounts
  const canManage = ctx.permissions.has("signatures.manage")

  const [rows, accounts] = await Promise.all([
    db
      .select({ id: s.id, name: s.name, body: s.body, ownerUserId: s.ownerUserId, updatedAt: s.updatedAt })
      .from(s)
      .where(and(eq(s.orgId, ctx.org.id), or(isNull(s.ownerUserId), eq(s.ownerUserId, ctx.user.id))))
      .orderBy(sql`${s.ownerUserId} is not null`, sql`lower(${s.name})`),
    db
      .select({ id: a.id, name: a.name, email: a.email, color: a.color, ownerUserId: a.ownerUserId, signatureId: a.signatureId })
      .from(a)
      .where(and(eq(a.orgId, ctx.org.id), or(isNull(a.ownerUserId), eq(a.ownerUserId, ctx.user.id))))
      .orderBy(asc(a.name)),
  ])

  const accountOptions: SignatureAccountOption[] = accounts.map((acc) => ({
    id: acc.id,
    name: acc.name,
    email: acc.email,
    color: acc.color,
    personal: acc.ownerUserId !== null,
    signatureId: acc.signatureId,
  }))

  const signatures: SignatureListItem[] = rows.map((r) => {
    const scope = r.ownerUserId ? "personal" : "workspace"
    return {
      id: r.id,
      name: r.name,
      body: r.body,
      scope,
      updatedAt: r.updatedAt,
      accountIds: accountOptions.filter((acc) => acc.signatureId === r.id).map((acc) => acc.id),
      editable: scope === "personal" || canManage,
    }
  })

  return {
    signatures,
    accounts: accountOptions,
    preview: {
      name: ctx.user.name || ctx.user.email.split("@")[0]!,
      title: ctx.membership.title ?? "",
      email: ctx.user.email,
    },
  }
}

