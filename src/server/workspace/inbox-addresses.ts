import "server-only"
import { and, eq, isNull, or } from "drizzle-orm"
import { db, schema, type DbOrTx } from "@/server/db"

/**
 * The workspace's own email addresses, for workspace-wide decisions such as
 * "never auto-reply or forward to ourselves" and "don't add our inboxes to the
 * shared address book".
 *
 * Only shared inboxes count: they are set up by members who manage inboxes.
 * A personal inbox's address and aliases are typed in by its owner and never
 * verified, so they must not change what happens for everyone else (a member
 * could otherwise list a customer's address as an alias to suppress
 * auto-replies to it or hide it from the address book). Pass `ownerUserId` to
 * also include that member's own personal inboxes, for decisions about their
 * personal mail only.
 */
export async function workspaceInboxAddresses(
  orgId: string,
  opts: { ownerUserId?: string | null; tx?: DbOrTx } = {}
): Promise<Set<string>> {
  const a = schema.accounts
  const rows = await (opts.tx ?? db)
    .select({ email: a.email, aliases: a.aliases })
    .from(a)
    .where(and(eq(a.orgId, orgId), opts.ownerUserId ? or(isNull(a.ownerUserId), eq(a.ownerUserId, opts.ownerUserId)) : isNull(a.ownerUserId)))
  const out = new Set<string>()
  for (const r of rows) {
    for (const address of [r.email, ...(r.aliases ?? [])]) {
      const e = address.trim().toLowerCase()
      if (e) out.add(e)
    }
  }
  return out
}
