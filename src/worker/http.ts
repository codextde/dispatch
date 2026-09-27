import http from "node:http"
import https from "node:https"
import net from "node:net"
import { BlockedHostError, guardedLookup, isPrivateNetworkBlocked } from "@/server/mail/net-guard"
import { isPrivateAddress } from "@/server/mail/ip-ranges"

/**
 * Minimal HTTP POST for webhooks: SSRF guard (validated on the address that
 * is actually connected), no redirects, hard timeout, bounded response read.
 */

const MAX_RESPONSE_BYTES = 1024

export type PostResult = { status: number; body: string }

export async function postJson(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  opts: { timeoutMs?: number } = {}
): Promise<PostResult> {
  const url = new URL(rawUrl)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Unsupported URL scheme: ${url.protocol}`)
  if (url.username || url.password) throw new Error("Credentials in webhook URLs are not supported")
  const guard = await isPrivateNetworkBlocked()
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (guard && net.isIP(host) && isPrivateAddress(host)) throw new BlockedHostError(host)

  const timeoutMs = opts.timeoutMs ?? 10_000
  const client = url.protocol === "https:" ? https : http
  return new Promise<PostResult>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body).toString() },
        ...(guard ? { lookup: guardedLookup } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          if (size < MAX_RESPONSE_BYTES) chunks.push(chunk)
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES * 16) res.destroy()
        })
        const done = () => {
          clearTimeout(timer)
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, MAX_RESPONSE_BYTES),
          })
        }
        res.on("end", done)
        res.on("close", done)
        res.on("error", done)
      }
    )
    const timer = setTimeout(() => req.destroy(Object.assign(new Error(`Timed out after ${timeoutMs / 1000}s`), { code: "ETIMEDOUT" })), timeoutMs)
    req.on("timeout", () => req.destroy(Object.assign(new Error(`Timed out after ${timeoutMs / 1000}s`), { code: "ETIMEDOUT" })))
    req.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
    req.end(body)
  })
}
