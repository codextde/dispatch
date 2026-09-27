import "server-only"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getDataDir } from "@/server/env"
import { getSettings, readSecret } from "@/server/settings"
import { randomToken } from "@/server/crypto"

/**
 * File storage for attachments and uploads.
 * - local (default): $DATA_DIR/storage (a Docker volume)
 * - s3: any S3-compatible bucket (AWS, R2, MinIO, Hetzner ...), configured in Admin → Storage
 */

function localRoot() {
  const root = path.join(getDataDir(), "storage")
  fs.mkdirSync(root, { recursive: true })
  return root
}

export class InvalidStorageKeyError extends Error {
  code = "EINVALIDKEY"
  constructor() {
    super("Invalid storage key")
  }
}

function localPath(key: string) {
  const root = localRoot()
  // "", "." and ".." segments would resolve to a parent directory that still passes the prefix check
  if (key.split(/[/\\]/).some((s) => s === "" || s === "." || s === "..")) throw new InvalidStorageKeyError()
  const p = path.resolve(root, key)
  if (!p.startsWith(root + path.sep)) throw new InvalidStorageKeyError()
  return p
}

async function s3() {
  const cfg = await getSettings("storage")
  if (cfg.driver !== "s3" || !cfg.s3Bucket) return null
  const client = new S3Client({
    region: cfg.s3Region || "auto",
    endpoint: cfg.s3Endpoint || undefined,
    forcePathStyle: cfg.s3ForcePathStyle,
    credentials: { accessKeyId: cfg.s3AccessKeyId, secretAccessKey: readSecret(cfg.s3SecretEnc) ?? "" },
  })
  return { client, bucket: cfg.s3Bucket }
}

/** Build a storage key: org/<orgId>/<yyyy>/<mm>/<random>/<safe-filename> */
export function makeStorageKey(orgId: string, filename: string) {
  const d = new Date()
  // Leading dots are stripped so a name can never be "." or ".." (or a hidden file)
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-120).replace(/^\.+/, "") || "file"
  return `org/${orgId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomToken(12)}/${safe}`
}

export async function putObject(key: string, body: Buffer, contentType = "application/octet-stream") {
  const remote = await s3()
  if (remote) {
    await remote.client.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: body, ContentType: contentType }))
    return
  }
  const p = localPath(key)
  await fsp.mkdir(path.dirname(p), { recursive: true })
  await fsp.writeFile(p, body)
}

export async function getObject(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const remote = await s3()
  if (remote) {
    try {
      const res = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }))
      return (res.Body as unknown as { transformToWebStream(): ReadableStream<Uint8Array> }).transformToWebStream()
    } catch {
      return null
    }
  }
  const p = localPath(key)
  if (!fs.existsSync(p)) return null
  return Readable.toWeb(fs.createReadStream(p)) as ReadableStream<Uint8Array>
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  const remote = await s3()
  if (remote) {
    try {
      const res = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }))
      const bytes = await (res.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
      return Buffer.from(bytes)
    } catch {
      return null
    }
  }
  try {
    return await fsp.readFile(localPath(key))
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  const remote = await s3()
  if (remote) {
    await remote.client.send(new DeleteObjectCommand({ Bucket: remote.bucket, Key: key })).catch(() => {})
    return
  }
  await fsp.rm(localPath(key), { force: true })
}

/** Verify storage works (used by the admin "Test connection" button). */
export async function testStorage(): Promise<{ ok: boolean; error?: string }> {
  const key = `healthcheck/${randomToken(8)}.txt`
  try {
    await putObject(key, Buffer.from("ok"), "text/plain")
    const buf = await getObjectBuffer(key)
    await deleteObject(key)
    return buf?.toString() === "ok" ? { ok: true } : { ok: false, error: "Read-back failed" }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
