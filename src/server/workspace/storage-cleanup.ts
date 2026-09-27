import "server-only"
import { after } from "next/server"
import { sql } from "drizzle-orm"
import { db, type DbOrTx } from "@/server/db"
import { deleteObject } from "@/server/storage"

/**
 * Attachment files live in object storage, not the database, so deleting
 * conversations (inbox delete, member removal, workspace delete) must remove
 * the files separately:
 *
 *   1. before the DB delete, collect the storage keys (inside the transaction)
 *   2. after it commits, `scheduleStorageCleanup(keys)` deletes every key that
 *      no remaining attachment row references — best effort, after the response
 */

/** Storage keys of all attachments (messages and comments) in the given conversations of `orgId`. */
export async function attachmentKeysForConversations(
  tx: DbOrTx,
  orgId: string,
  where: { accountIds: string[] }
): Promise<string[]> {
  if (!where.accountIds.length) return []
  const convFilter = sql`c.org_id = ${orgId} and c.account_id in (${sql.join(where.accountIds.map((id) => sql`${id}::uuid`), sql`, `)})`
  const rows = await tx.execute<{ key: string }>(sql`
    select distinct a.storage_key as key
    from attachments a
    where a.org_id = ${orgId} and (
      a.message_id in (select m.id from messages m join conversations c on c.id = m.conversation_id where ${convFilter})
      or a.comment_id in (select co.id from comments co join conversations c on c.id = co.conversation_id where ${convFilter})
    )`)
  return rows.map((r) => r.key)
}

/**
 * `attachments.comment_id` has no foreign key, so comment attachments survive
 * a conversation delete as orphan rows. Remove them explicitly (call inside
 * the transaction, before deleting the conversations).
 */
export async function deleteCommentAttachmentRows(tx: DbOrTx, orgId: string, accountIds: string[]) {
  if (!accountIds.length) return
  await tx.execute(sql`
    delete from attachments a
    using comments co, conversations c
    where a.comment_id = co.id and co.conversation_id = c.id
      and a.org_id = ${orgId} and c.org_id = ${orgId}
      and c.account_id in (${sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
}

const BATCH = 20

/** Delete files whose keys are no longer referenced by any attachment row. Never throws. */
export async function deleteUnreferencedObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return 0
  let deleted = 0
  try {
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500)
      const still = await db.execute<{ key: string }>(sql`
        select distinct storage_key as key from attachments
        where storage_key in (${sql.join(chunk.map((k) => sql`${k}`), sql`, `)})`)
      const referenced = new Set(still.map((r) => r.key))
      const orphaned = chunk.filter((k) => !referenced.has(k))
      for (let j = 0; j < orphaned.length; j += BATCH) {
        const results = await Promise.allSettled(orphaned.slice(j, j + BATCH).map((k) => deleteObject(k)))
        for (const r of results) {
          if (r.status === "fulfilled") deleted++
          else console.error("[storage-cleanup] failed to delete object", r.reason)
        }
      }
    }
  } catch (err) {
    console.error("[storage-cleanup] cleanup failed", err)
  }
  return deleted
}

/** Run the file cleanup after the response is sent (server actions / route handlers). */
export function scheduleStorageCleanup(keys: string[]) {
  if (!keys.length) return
  after(() => deleteUnreferencedObjects(keys))
}
