import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { deleteObject, putObject } from "@/server/storage"
import { randomToken } from "@/server/crypto"
import { fail } from "@/server/workspace/context"

/**
 * Small image uploads managed from settings (user avatars, workspace logos).
 *
 * Stored with `putObject` under unguessable keys and served by
 * /w/[slug]/settings/files/[...key] to signed-in users who share a workspace
 * with the owner. SVG is rejected (script risk); the client downscales images
 * to 256px WebP before uploading.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
} as const
type ImageExt = keyof typeof TYPES

export type ImageKind = "avatars" | "logos"

/** Detect the image type from magic bytes (never trust the declared type). */
export function sniffImage(buf: Buffer): ImageExt | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "gif"
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
  return null
}

export const IMAGE_KEY_RE = /^(avatars|logos)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([A-Za-z0-9_-]{8,64})\.(png|jpg|gif|webp)$/

export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1) as ImageExt
  return TYPES[ext] ?? "application/octet-stream"
}

export function imageUrl(slug: string, key: string) {
  return `/w/${slug}/settings/files/${key}`
}

/** Extract the storage key from a URL produced by `imageUrl` (any workspace slug). */
export function keyFromImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /^\/w\/[^/]+\/settings\/files\/(.+)$/.exec(url)
  return m && IMAGE_KEY_RE.test(m[1]!) ? m[1]! : null
}

/** Validate and store an uploaded image; returns its storage key. */
export async function storeImage(kind: ImageKind, ownerId: string, file: File): Promise<string> {
  if (file.size === 0) fail("The file is empty.")
  if (file.size > MAX_IMAGE_BYTES) fail("Images must be smaller than 2 MB.")
  const buf = Buffer.from(await file.arrayBuffer())
  const ext = sniffImage(buf)
  if (!ext) fail("Unsupported image. Use PNG, JPEG, GIF or WebP.")
  const key = `${kind}/${ownerId}/${randomToken(12)}.${ext}`
  await putObject(key, buf, TYPES[ext])
  return key
}

/** Best-effort removal of a previously uploaded image (ignores external URLs). */
export async function deleteImageByUrl(url: string | null | undefined) {
  const key = keyFromImageUrl(url)
  if (key) await deleteObject(key).catch(() => {})
}

/**
 * May `viewerId` see the image stored under `key`?
 *  - avatars/<userId>/…: the user themself, or anyone sharing an active workspace
 *  - logos/<orgId>/…: active members of that workspace
 */
export async function canViewImage(key: string, viewer: { id: string; isSuperAdmin: boolean }): Promise<boolean> {
  const m = IMAGE_KEY_RE.exec(key)
  if (!m) return false
  const [, kind, ownerId] = m
  if (viewer.isSuperAdmin) return true
  if (kind === "avatars") {
    if (ownerId === viewer.id) return true
    const rows = await db.execute(sql`
      select 1 from memberships a
      join memberships b on b.org_id = a.org_id
      where a.user_id = ${viewer.id} and a.status = 'active' and b.user_id = ${ownerId}
      limit 1`)
    return rows.length > 0
  }
  const [row] = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.orgId, ownerId!),
        eq(schema.memberships.userId, viewer.id),
        eq(schema.memberships.status, "active")
      )
    )
    .limit(1)
  return Boolean(row)
}
