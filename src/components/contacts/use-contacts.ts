"use client"

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import type { ContactConversation, ContactDto } from "@/server/contacts"
import type { ImportRow } from "./csv"

export type { ContactConversation, ContactDto }

export type ContactScope = "all" | "shared" | "private"
export type ContactSort = "name" | "recent" | "company"
export type ContactFilters = { q?: string; company?: string; tag?: string; scope?: ContactScope; sort?: ContactSort }
export type ContactFacets = {
  companies: { name: string; count: number }[]
  tags: { tag: string; count: number }[]
  counts: { all: number; shared: number; private: number }
}
export type ContactInput = Partial<{
  email: string
  alternateEmails: string[]
  name: string | null
  company: string | null
  title: string | null
  phone: string | null
  notes: string | null
  tags: string[]
  customFields: Record<string, string>
  isPrivate: boolean
}>

export const contactKeys = {
  all: (slug: string) => ["contacts", slug] as const,
  list: (slug: string, f: ContactFilters) => ["contacts", slug, "list", f] as const,
  facets: (slug: string) => ["contacts", slug, "facets"] as const,
  detail: (slug: string, id: string) => ["contacts", slug, "detail", id] as const,
  lookup: (slug: string, email: string) => ["contacts", slug, "lookup", email.toLowerCase()] as const,
}

const PAGE = 100

function qs(f: ContactFilters & { limit?: number; offset?: number; facets?: "1" }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v))
  return p.toString()
}

export function useContactList(slug: string, filters: ContactFilters) {
  return useInfiniteQuery({
    queryKey: contactKeys.list(slug, filters),
    queryFn: ({ pageParam }) =>
      api.get<{ contacts: ContactDto[]; total: number }>(`/api/w/${slug}/contacts?${qs({ ...filters, limit: PAGE, offset: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.contacts.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    staleTime: 30_000,
  })
}

export function useContactFacets(slug: string) {
  return useQuery({
    queryKey: contactKeys.facets(slug),
    queryFn: () =>
      api.get<{ facets: ContactFacets }>(`/api/w/${slug}/contacts?${qs({ limit: 1, facets: "1" })}`).then((r) => r.facets),
    staleTime: 60_000,
  })
}

export function useContactDetail(slug: string, id: string | null) {
  return useQuery({
    queryKey: contactKeys.detail(slug, id ?? ""),
    queryFn: () =>
      api.get<{ contact: ContactDto; conversations: ContactConversation[]; conversationTotal: number }>(`/api/w/${slug}/contacts/${id}`),
    enabled: Boolean(id),
  })
}

export type ContactLookup = {
  email: string
  contact: ContactDto | null
  conversations: ContactConversation[]
  conversationTotal: number
}

export function useContactLookup(slug: string, email: string | null | undefined) {
  return useQuery({
    queryKey: contactKeys.lookup(slug, email ?? ""),
    queryFn: () => api.get<ContactLookup>(`/api/w/${slug}/contacts/lookup?email=${encodeURIComponent(email ?? "")}`),
    enabled: Boolean(email),
    staleTime: 60_000,
  })
}

export function useContactMutations(slug: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: contactKeys.all(slug) })

  const create = useMutation({
    mutationFn: (input: ContactInput & { email: string }) => api.post<ContactDto>(`/api/w/${slug}/contacts`, input),
    onSuccess: () => void refresh(),
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContactInput }) => api.patch<ContactDto>(`/api/w/${slug}/contacts/${id}`, patch),
    onSuccess: (contact) => {
      // Update caches in place so inline edits feel instant
      qc.setQueriesData<{ contact: ContactDto }>({ queryKey: contactKeys.detail(slug, contact.id) }, (old) => (old ? { ...old, contact } : old))
      qc.setQueriesData<{ contact: ContactDto | null }>(
        { queryKey: [...contactKeys.all(slug), "lookup"] },
        (old) => (old?.contact?.id === contact.id ? { ...old, contact } : old)
      )
      void qc.invalidateQueries({ queryKey: [...contactKeys.all(slug), "list"] })
      void qc.invalidateQueries({ queryKey: contactKeys.facets(slug) })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/w/${slug}/contacts/${id}`),
    onSuccess: () => void refresh(),
    onError: (err: Error) => toast.error(err.message),
  })

  const importContacts = useMutation({
    mutationFn: (input: { contacts: ImportRow[]; isPrivate?: boolean; mode: "skip" | "update" }) =>
      api.post<{ created: number; updated: number; skipped: number; invalid: number }>(`/api/w/${slug}/contacts/import`, input),
    onSuccess: () => void refresh(),
  })

  const merge = useMutation({
    mutationFn: (input: { targetId: string; sourceIds: string[] }) => api.post<ContactDto>(`/api/w/${slug}/contacts/merge`, input),
    onSuccess: () => void refresh(),
    onError: (err: Error) => toast.error(err.message),
  })

  return { create, update, remove, importContacts, merge }
}

export function displayName(c: { name?: string | null; email: string }) {
  return c.name?.trim() || c.email
}
