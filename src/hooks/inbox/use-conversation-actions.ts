"use client"

import { useCallback } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { applyPatch, inversePatch, stillMatches } from "@/lib/inbox/match"
import type { ListFilters } from "@/lib/inbox/boxes"
import type { ConversationListItem, ConversationPatch, ConversationThread } from "@/lib/inbox/types"
import { useInbox } from "@/components/inbox/inbox-provider"
import { inboxKeys, type ListData } from "./queries"

type Vars = { ids: string[]; patch: ConversationPatch }
type Snapshot = { lists: [QueryKey, ListData | undefined][]; threads: [string, ConversationThread | undefined][] }

export type RunOptions = {
  /** Show a toast with an Undo button */
  undo?: string
  /** Called after the server confirmed the change */
  onDone?: () => void
}

/**
 * Conversation mutations with optimistic updates across every cached list
 * and thread, rollback on error and optional "Undo" toasts.
 *
 *   const { run, find } = useConversationActions()
 *   run([id], { status: "closed" }, { undo: "Conversation closed" })
 */
export function useConversationActions() {
  const { slug, meId, bootstrap } = useInbox()
  const qc = useQueryClient()

  const find = useCallback(
    (id: string): ConversationListItem | undefined => {
      const thread = qc.getQueryData<ConversationThread>(inboxKeys.thread(slug, id))
      if (thread) return thread.conversation
      for (const [, data] of qc.getQueriesData<ListData>({ queryKey: inboxKeys.lists(slug) })) {
        for (const page of data?.pages ?? []) {
          const hit = page.items.find((i) => i.id === id)
          if (hit) return hit
        }
      }
      return undefined
    },
    [qc, slug]
  )

  const { mutateAsync, isPending } = useMutation<unknown, Error, Vars, Snapshot>({
    mutationFn: ({ ids, patch }) =>
      ids.length === 1
        ? api.patch(`/api/w/${slug}/conversations/${ids[0]}`, patch)
        : api.post(`/api/w/${slug}/conversations/bulk`, { ids, patch }),
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.lists(slug) })
      const lists = qc.getQueriesData<ListData>({ queryKey: inboxKeys.lists(slug) })
      const threads = ids.map((id) => [id, qc.getQueryData<ConversationThread>(inboxKeys.thread(slug, id))] as [string, ConversationThread | undefined])
      const idSet = new Set(ids)
      const ctx = { meId, accounts: bootstrap.accounts }
      for (const [key, data] of lists) {
        if (!data) continue
        const box = String(key[3] ?? "")
        const filters = (key[4] ?? {}) as ListFilters
        qc.setQueryData<ListData>(key, {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.flatMap((item) => {
              if (!idSet.has(item.id)) return [item]
              const next = applyPatch(item, patch)
              return stillMatches(box, filters, next, ctx) ? [next] : []
            }),
          })),
        })
      }
      for (const [id, thread] of threads) {
        if (!thread) continue
        qc.setQueryData<ConversationThread>(inboxKeys.thread(slug, id), {
          ...thread,
          conversation: { ...thread.conversation, ...applyPatch(thread.conversation, patch), ...(patch.subject !== undefined ? { customSubject: patch.subject } : {}) },
        })
      }
      return { lists, threads }
    },
    onError: (err, _vars, snap) => {
      for (const [key, data] of snap?.lists ?? []) qc.setQueryData(key, data)
      for (const [id, thread] of snap?.threads ?? []) qc.setQueryData(inboxKeys.thread(slug, id), thread)
      toast.error(err.message || "Could not update the conversation")
    },
    onSettled: (_data, _err, { ids }) => {
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
      for (const id of ids) void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, id) })
    },
  })

  const run = useCallback(
    (ids: string[], patch: ConversationPatch, opts: RunOptions = {}) => {
      if (!ids.length) return
      const previous = ids.map((id) => find(id)).filter(Boolean) as ConversationListItem[]
      // mutateAsync keeps each call's continuation even when calls overlap
      // (e.g. "close" followed immediately by "mark read" on the next conversation).
      mutateAsync({ ids, patch })
        .then(() => {
          opts.onDone?.()
          if (!opts.undo) return
          // Group items by the patch that undoes the change for them.
          const groups = new Map<string, { ids: string[]; patch: ConversationPatch }>()
          for (const item of previous) {
            const inv = inversePatch(item, patch)
            if (!inv) continue
            const key = JSON.stringify(inv)
            const g = groups.get(key) ?? { ids: [], patch: inv }
            g.ids.push(item.id)
            groups.set(key, g)
          }
          toast(opts.undo, {
            action: groups.size
              ? { label: "Undo", onClick: () => groups.forEach((g) => void mutateAsync({ ids: g.ids, patch: g.patch }).catch(() => {})) }
              : undefined,
          })
        })
        .catch(() => {
          /* rolled back + toast in onError */
        })
    },
    [find, mutateAsync]
  )

  return { run, find, pending: isPending }
}
