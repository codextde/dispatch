"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"

export type AiStatus = {
  enabled: boolean
  provider: "anthropic" | "openai" | null
  model: string | null
  source: "workspace" | "instance" | null
  canConfigure: boolean
}

export type AiSummaryResult = {
  tldr: string
  points: string[]
  nextSteps: string[]
  sentiment: "positive" | "neutral" | "negative" | "urgent" | null
}

export type AiTextResult = { text: string; html: string }
export type ReplyTone = "friendly" | "formal" | "concise"
export type ImproveMode = "fix" | "shorter" | "longer" | "friendlier" | "formal"

export const aiKeys = {
  status: (slug: string) => ["ai", slug, "status"] as const,
  summary: (slug: string, conversationId: string) => ["ai", slug, "summary", conversationId] as const,
}

export function useAiStatus(slug: string) {
  return useQuery({
    queryKey: aiKeys.status(slug),
    queryFn: () => api.get<AiStatus>(`/api/w/${slug}/ai/status`),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Where admins configure AI for the workspace. */
export function aiSettingsHref(slug: string) {
  return `/w/${slug}/settings/general#ai`
}

/** POST to an AI endpoint with abort support (AI calls can take a few seconds). */
export async function aiRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  const data = await res.json().catch(() => undefined)
  if (!res.ok) throw new Error(data?.error?.message ?? "The AI request failed. Try again.")
  return data as T
}
