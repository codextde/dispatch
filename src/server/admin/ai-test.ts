import "server-only"
import { getSettings, readSecret } from "@/server/settings"

/**
 * "Test" button of Admin → Settings → AI: sends one tiny request to the
 * configured provider (possibly with unsaved form values) and reports latency
 * and the model's reply. Self-contained (plain fetch) so it works without any
 * provider SDK. The API key is never logged or returned.
 */

export type AiTestInput = {
  provider: "anthropic" | "openai"
  model: string
  baseUrl: string
  /** New key typed in the form; undefined → use the stored key */
  apiKey?: string
}

export type AiTestResult =
  | { ok: true; latencyMs: number; model: string; reply: string }
  | { ok: false; error: string }

const TIMEOUT_MS = 20_000
const PROMPT = "Reply with the single word: OK"

export async function testAiProvider(input: AiTestInput): Promise<AiTestResult> {
  const stored = await getSettings("ai")
  // The stored key is only ever sent to the saved provider/endpoint, never to an arbitrary URL from the form
  const sameTarget = input.provider === stored.provider && input.baseUrl.replace(/\/+$/, "") === stored.baseUrl.replace(/\/+$/, "")
  if (input.apiKey === undefined && stored.apiKeyEnc && !sameTarget) {
    return { ok: false, error: "You changed the provider or base URL — enter the API key again to test it." }
  }
  const apiKey = (input.apiKey !== undefined ? input.apiKey : readSecret(stored.apiKeyEnc) ?? "").trim()
  const isLocalCompatible = input.provider === "openai" && Boolean(input.baseUrl)
  if (!apiKey && !isLocalCompatible) return { ok: false, error: "Add an API key first." }
  if (!input.model.trim()) return { ok: false, error: "Enter a model id." }

  const started = performance.now()
  try {
    const res = input.provider === "anthropic" ? await callAnthropic(input, apiKey) : await callOpenAi(input, apiKey)
    return { ...res, latencyMs: Math.round(performance.now() - started) }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

class ProviderError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function endpoint(base: string, fallback: string, path: string) {
  const root = (base || fallback).replace(/\/+$/, "")
  return `${root}${path}`
}

async function readError(res: Response): Promise<ProviderError> {
  let message = res.statusText || "Request failed"
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
    const m = typeof body.error === "string" ? body.error : body.error?.message ?? body.message
    if (m) message = m
  } catch {
    /* non-JSON error body */
  }
  return new ProviderError(res.status, message)
}

async function callAnthropic(input: AiTestInput, apiKey: string) {
  // The Anthropic API root (a trailing /v1 is tolerated); a custom base URL allows proxies/gateways.
  const url = endpoint(input.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, ""), "https://api.anthropic.com", "/v1/messages")
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model.trim(),
      max_tokens: 512,
      messages: [{ role: "user", content: PROMPT }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw await readError(res)
  const data = (await res.json()) as {
    model?: string
    stop_reason?: string
    content?: { type: string; text?: string }[]
  }
  if (data.stop_reason === "refusal") throw new ProviderError(200, "The model declined the test prompt.")
  const reply = (data.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join(" ")
    .trim()
  return { ok: true as const, model: data.model ?? input.model, reply: reply.slice(0, 200) || "(empty reply)" }
}

async function callOpenAi(input: AiTestInput, apiKey: string) {
  const url = endpoint(input.baseUrl, "https://api.openai.com/v1", "/chat/completions")
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.model.trim(),
      max_completion_tokens: 512,
      messages: [{ role: "user", content: PROMPT }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) throw await readError(res)
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string | null } }[] }
  const reply = data.choices?.[0]?.message?.content?.trim() ?? ""
  return { ok: true as const, model: data.model ?? input.model, reply: reply.slice(0, 200) || "(empty reply)" }
}

function describeError(err: unknown): string {
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403) return `Authentication failed (${err.status}): ${err.message}`
    if (err.status === 404) return `Not found (404): ${err.message}. Check the model id and base URL.`
    if (err.status === 429) return `Rate limited or out of credits (429): ${err.message}`
    if (err.status >= 500) return `The provider had an error (${err.status}): ${err.message}`
    return err.status === 200 ? err.message : `Request rejected (${err.status}): ${err.message}`
  }
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return `No response within ${TIMEOUT_MS / 1000} seconds.`
  if (e?.cause?.code === "ENOTFOUND") return "The provider host could not be resolved. Check the base URL."
  if (e?.cause?.code === "ECONNREFUSED") return "Connection refused. Check the base URL."
  return e?.cause?.message || e?.message || "Request failed"
}
