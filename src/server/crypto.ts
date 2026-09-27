import "server-only"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { getDataDir } from "@/server/env"

/**
 * Master secret: DISPATCH_SECRET env, or auto-generated on first boot and
 * persisted in $DATA_DIR/secrets/master.key (0600). Used to derive:
 *  - the AES-256-GCM key for encrypting stored credentials
 *  - HMAC keys for signing (webhooks, OAuth state, unsubscribe links ...)
 */
let masterSecret: Buffer | null = null

function loadMasterSecret(): Buffer {
  if (masterSecret) return masterSecret
  const fromEnv = process.env.DISPATCH_SECRET
  if (fromEnv && fromEnv.length >= 32) {
    masterSecret = Buffer.from(fromEnv, "utf8")
    return masterSecret
  }
  const dir = path.join(getDataDir(), "secrets")
  const file = path.join(dir, "master.key")
  try {
    const existing = fs.readFileSync(file, "utf8").trim()
    if (existing) {
      masterSecret = Buffer.from(existing, "base64")
      return masterSecret
    }
  } catch {
    /* generate below */
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const generated = crypto.randomBytes(48)
  try {
    // wx: fail if another process created it concurrently
    fs.writeFileSync(file, generated.toString("base64"), { mode: 0o600, flag: "wx" })
    masterSecret = generated
  } catch {
    masterSecret = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64")
  }
  return masterSecret
}

function deriveKey(purpose: string, length = 32): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", loadMasterSecret(), Buffer.alloc(0), `dispatch:${purpose}`, length))
}

let encKey: Buffer | null = null
const getEncKey = () => (encKey ??= deriveKey("encryption"))

/** Encrypt a string. Output: "v1:<iv>:<tag>:<ciphertext>" (base64url parts). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(":")
}

export function decrypt(payload: string): string {
  const [v, ivB, tagB, encB] = payload.split(":")
  if (v !== "v1" || !ivB || !tagB || encB === undefined) throw new Error("Invalid encrypted payload")
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncKey(), Buffer.from(ivB, "base64url"))
  decipher.setAuthTag(Buffer.from(tagB, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8")
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value))
}

export function decryptJson<T>(payload: string | null | undefined): T | null {
  if (!payload) return null
  try {
    return JSON.parse(decrypt(payload)) as T
  } catch {
    return null
  }
}

/** Safe decrypt returning undefined on failure/empty. */
export function tryDecrypt(payload: string | null | undefined): string | undefined {
  if (!payload) return undefined
  try {
    return decrypt(payload)
  } catch {
    return undefined
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url")
}

/** Numeric one-time code, e.g. "482913". */
export function randomCode(digits = 6): string {
  const max = 10 ** digits
  return crypto.randomInt(0, max).toString().padStart(digits, "0")
}

/** SHA-256 hash (hex) for storing tokens; tokens are high entropy so no salt needed. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Keyed hash for low-entropy secrets such as 6-digit codes. */
export function hmac(value: string, purpose = "generic"): string {
  return crypto.createHmac("sha256", deriveKey(`hmac:${purpose}`)).update(value).digest("hex")
}

export function sign(value: string, purpose = "sign"): string {
  const sig = crypto.createHmac("sha256", deriveKey(`sign:${purpose}`)).update(value).digest("base64url")
  return `${value}.${sig}`
}

export function unsign(signed: string, purpose = "sign"): string | null {
  const idx = signed.lastIndexOf(".")
  if (idx < 0) return null
  const value = signed.slice(0, idx)
  const expected = sign(value, purpose)
  return safeEqual(expected, signed) ? value : null
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/** Mask a secret for display: "sk_live_…a1b2" */
export function maskSecret(secret: string | undefined | null, visible = 4): string {
  if (!secret) return ""
  if (secret.length <= visible * 2) return "••••••"
  return `${secret.slice(0, Math.min(7, visible + 3))}…${secret.slice(-visible)}`
}
