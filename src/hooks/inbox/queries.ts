"use client"

import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { ListFilters } from "@/lib/inbox/boxes"
import type {
  Bootstrap,
  BoxCounts,
  CannedResponseItem,
  ChatSummary,
  ConversationListItem,
  ConversationPage,
  ConversationThread,
  MessageBody,
  NotificationPage,
  RecipientSuggestion,
} from "@/lib/inbox/types"

/** Query keys of the inbox. Everything lives under ["inbox", slug]. */
export const inboxKeys = {
  all: (slug: string) => ["inbox", slug] as const,
  bootstrap: (slug: string) => ["inbox", slug, "bootstrap"] as const,
  counts: (slug: string) => ["inbox", slug, "counts"] as const,
  lists: (slug: string) => ["inbox", slug, "list"] as const,
  list: (slug: string, box: string, filters: ListFilters) => ["inbox", slug, "list", box, filters] as const,
  thread: (slug: string, id: string) => ["inbox", slug, "thread", id] as const,
  threads: (slug: string) => ["inbox", slug, "thread"] as const,
  body: (slug: string, messageId: string, images: boolean) => ["inbox", slug, "body", messageId, images] as const,
  notifications: (slug: string) => ["inbox", slug, "notifications"] as const,
  chats: (slug: string) => ["inbox", slug, "chats"] as const,
  responses: (slug: string) => ["inbox", slug, "responses"] as const,
  recipients: (slug: string, q: string) => ["inbox", slug, "recipients", q] as const,
  search: (slug: string, q: string) => ["inbox", slug, "search", q] as const,
}

export type ListData = InfiniteData<ConversationPage, string | null>

export function useBootstrap(slug: string) {
  return useQuery({
    queryKey: inboxKeys.bootstrap(slug),
    queryFn: () => api.get<Bootstrap>(`/api/w/${slug}/bootstrap`),
    staleTime: 60_000,
  })
}

export function useCounts(slug: string, initial?: BoxCounts) {
  return useQuery({
    queryKey: inboxKeys.counts(slug),
    queryFn: () => api.get<{ counts: BoxCounts }>(`/api/w/${slug}/bootstrap?only=counts`).then((r) => r.counts),
    initialData: initial,
    staleTime: 15_000,
  })
}

function listParams(box: string, filters: ListFilters, cursor: string | null) {
  const p = new URLSearchParams({ box })
  if (filters.status) p.set("status", filters.status)
  if (filters.unread) p.set("unread", "1")
  if (filters.assignee && filters.assignee !== "anyone") p.set("assignee", filters.assignee)
  if (filters.sort && filters.sort !== "newest") p.set("sort", filters.sort)
  if (filters.q) p.set("q", filters.q)
  if (cursor) p.set("cursor", cursor)
  return p.toString()
}

export function useChats(slug: string, initial?: ChatSummary[]) {
  return useQuery({
    queryKey: inboxKeys.chats(slug),
    queryFn: () => api.get<{ items: ChatSummary[] }>(`/api/w/${slug}/chats`).then((r) => r.items),
    initialData: initial,
    staleTime: 15_000,
  })
}

export function useConversationList(slug: string, box: string, filters: ListFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(slug, box, filters),
    queryFn: ({ pageParam, signal }) =>
      api.get<ConversationPage>(`/api/w/${slug}/conversations?${listParams(box, filters, pageParam)}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: box === "search" ? keepPreviousData : undefined,
    staleTime: 20_000,
    enabled,
  })
}

export function useThread(slug: string, id: string | null) {
  return useQuery({
    queryKey: inboxKeys.thread(slug, id ?? ""),
    queryFn: ({ signal }) => api.get<ConversationThread>(`/api/w/${slug}/conversations/${id}`, { signal }),
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useMessageBody(slug: string, messageId: string, images: boolean, enabled = true) {
  return useQuery({
    queryKey: inboxKeys.body(slug, messageId, images),
    queryFn: ({ signal }) => api.get<MessageBody>(`/api/w/${slug}/messages/${messageId}${images ? "?images=1" : ""}`, { signal }),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    enabled,
  })
}

export function useNotifications(slug: string) {
  return useInfiniteQuery({
    queryKey: inboxKeys.notifications(slug),
    queryFn: ({ pageParam }) =>
      api.get<NotificationPage>(`/api/w/${slug}/notifications?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  })
}

export function useResponses(slug: string, enabled = true) {
  return useQuery<CannedResponseItem[]>({
    queryKey: inboxKeys.responses(slug),
    queryFn: () => api.get<{ items: CannedResponseItem[] }>(`/api/w/${slug}/responses`).then((r) => r.items),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useRecipientSearch(slug: string, q: string) {
  const query = q.trim()
  return useQuery<RecipientSuggestion[]>({
    queryKey: inboxKeys.recipients(slug, query.toLowerCase()),
    queryFn: ({ signal }) =>
      api.get<{ items: RecipientSuggestion[] }>(`/api/w/${slug}/search/recipients?q=${encodeURIComponent(query)}`, { signal }).then((r) => r.items),
    enabled: query.length >= 1,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useSearch(slug: string, q: string) {
  const query = q.trim()
  return useQuery<ConversationListItem[]>({
    queryKey: inboxKeys.search(slug, query),
    queryFn: ({ signal }) => api.get<ConversationPage>(`/api/w/${slug}/search?q=${encodeURIComponent(query)}&limit=8`, { signal }).then((r) => r.items),
    enabled: query.length >= 2,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  })
}
