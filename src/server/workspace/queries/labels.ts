import "server-only"
import { and, asc, eq, or } from "drizzle-orm"
import { db, schema } from "@/server/db"
import type { OrgContext } from "@/server/authz"
import { labelConversationCounts } from "@/server/workspace/services/labels"

export type LabelListItem = {
  id: string
  name: string
  color: string
  parentId: string | null
  visibility: "shared" | "private"
  position: number
  showInSidebar: boolean
  conversationCount: number
}

/** Shared labels and the member's private labels, with conversation counts. */
export async function loadLabelsPage(ctx: Pick<OrgContext, "org" | "user" | "permissions">) {
  const l = schema.labels
  const rows = await db
    .select({
      id: l.id,
      name: l.name,
      color: l.color,
      parentId: l.parentId,
      visibility: l.visibility,
      position: l.position,
      showInSidebar: l.showInSidebar,
    })
    .from(l)
    .where(and(eq(l.orgId, ctx.org.id), or(eq(l.visibility, "shared"), eq(l.ownerUserId, ctx.user.id))))
    .orderBy(asc(l.position), asc(l.name))
  const counts = await labelConversationCounts(
    ctx,
    rows.map((r) => r.id)
  )
  const items: LabelListItem[] = rows.map((r) => ({ ...r, conversationCount: counts.get(r.id) ?? 0 }))
  return {
    shared: items.filter((i) => i.visibility === "shared"),
    private: items.filter((i) => i.visibility === "private"),
  }
}
