"use client"

import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import type { TaskDto, TaskStatus } from "@/server/tasks"

export type { TaskDto, TaskStatus }

export type TaskMember = { id: string; name: string | null; email: string; avatarUrl: string | null }
export type TaskTeam = { id: string; name: string; color: string }
export type TaskOptions = { members: TaskMember[]; teams: TaskTeam[]; canManage: boolean }

export type TaskQuery = {
  assignee?: string
  status?: string
  teamId?: string
  conversationId?: string
  due?: "overdue" | "today" | "week" | "upcoming" | "none"
  q?: string
}

export type TaskPatch = Partial<{
  title: string
  description: string | null
  status: TaskStatus
  assigneeId: string | null
  teamId: string | null
  dueAt: string | null
  conversationId: string | null
  position: number
}>

/** Query keys: everything task related for a workspace lives under ["tasks", slug]. */
export const taskKeys = {
  all: (slug: string) => ["tasks", slug] as const,
  list: (slug: string, q: TaskQuery) => ["tasks", slug, "list", q] as const,
  options: (slug: string) => ["tasks", slug, "options"] as const,
}

function toSearch(q: TaskQuery) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v))
  p.set("tz", String(new Date().getTimezoneOffset()))
  return p.toString()
}

export function useTasks(slug: string, q: TaskQuery, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: taskKeys.list(slug, q),
    queryFn: () => api.get<{ tasks: TaskDto[] }>(`/api/w/${slug}/tasks?${toSearch(q)}`).then((r) => r.tasks),
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
  })
}

export function useTaskOptions(slug: string) {
  return useQuery({
    queryKey: taskKeys.options(slug),
    queryFn: () => api.get<TaskOptions>(`/api/w/${slug}/tasks/options`),
    staleTime: 5 * 60_000,
  })
}

type Snapshot = [QueryKey, TaskDto[] | undefined][]

/** Apply `fn` to every cached task list of the workspace (optimistic updates). */
function patchLists(qc: ReturnType<typeof useQueryClient>, slug: string, fn: (tasks: TaskDto[]) => TaskDto[]): Snapshot {
  const snapshot = qc.getQueriesData<TaskDto[]>({ queryKey: [...taskKeys.all(slug), "list"] })
  for (const [key, data] of snapshot) if (data) qc.setQueryData(key, fn(data))
  return snapshot
}

function restore(qc: ReturnType<typeof useQueryClient>, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data)
}

export function useTaskMutations(slug: string, options?: TaskOptions) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [...taskKeys.all(slug), "list"] })

  const create = useMutation({
    mutationFn: (input: TaskPatch & { title: string }) => api.post<TaskDto>(`/api/w/${slug}/tasks`, input),
    onSuccess: (task) => {
      patchLists(qc, slug, (list) => (list.some((t) => t.id === task.id) ? list : [...list, task]))
      void invalidate()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.patch<TaskDto>(`/api/w/${slug}/tasks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: [...taskKeys.all(slug), "list"] })
      return patchLists(qc, slug, (list) => list.map((t) => (t.id === id ? applyPatch(t, patch, options) : t)))
    },
    onError: (err: Error, _v, snapshot) => {
      restore(qc, snapshot)
      toast.error(err.message)
    },
    onSuccess: (task) => patchLists(qc, slug, (list) => list.map((t) => (t.id === task.id ? task : t))),
    onSettled: () => invalidate(),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/w/${slug}/tasks/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: [...taskKeys.all(slug), "list"] })
      return patchLists(qc, slug, (list) => list.filter((t) => t.id !== id))
    },
    onError: (err: Error, _v, snapshot) => {
      restore(qc, snapshot)
      toast.error(err.message)
    },
    onSettled: () => invalidate(),
  })

  const reorder = useMutation({
    mutationFn: ({ status, ids }: { status: TaskStatus; ids: string[] }) => api.post(`/api/w/${slug}/tasks/reorder`, { status, ids }),
    onMutate: async ({ status, ids }) => {
      await qc.cancelQueries({ queryKey: [...taskKeys.all(slug), "list"] })
      const order = new Map(ids.map((id, i) => [id, i]))
      return patchLists(qc, slug, (list) =>
        list.map((t) =>
          order.has(t.id)
            ? {
                ...t,
                status,
                position: order.get(t.id)!,
                completedAt: status === "done" ? (t.completedAt ?? new Date().toISOString()) : null,
              }
            : t
        )
      )
    },
    onError: (err: Error, _v, snapshot) => {
      restore(qc, snapshot)
      toast.error(err.message)
    },
    onSettled: () => invalidate(),
  })

  return { create, update, remove, reorder }
}

/** Optimistic local version of a task after a patch. */
export function applyPatch(t: TaskDto, patch: TaskPatch, options?: TaskOptions): TaskDto {
  const next: TaskDto = { ...t }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.description !== undefined) next.description = patch.description
  if (patch.status !== undefined) {
    next.status = patch.status
    next.completedAt = patch.status === "done" ? (t.completedAt ?? new Date().toISOString()) : null
  }
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt
  if (patch.position !== undefined) next.position = patch.position
  if (patch.assigneeId !== undefined) {
    const m = options?.members.find((x) => x.id === patch.assigneeId)
    next.assignee = m ? { id: m.id, name: m.name, email: m.email, avatarUrl: m.avatarUrl } : null
  }
  if (patch.teamId !== undefined) next.team = options?.teams.find((x) => x.id === patch.teamId) ?? null
  if (patch.conversationId === null) next.conversation = null
  return next
}

/**
 * Keep task lists fresh while a standalone tasks page is open: listens to the
 * workspace event stream and refetches on "task.updated".
 */
export function useTaskRealtime(slug: string) {
  const qc = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const es = new EventSource(`/api/w/${slug}/events`)
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type?: string }
        if (event.type !== "task.updated" && event.type !== "conversation.deleted") return
      } catch {
        return
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: taskKeys.all(slug) }), 250)
    }
    es.addEventListener("logout", () => es.close())
    return () => {
      es.close()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [slug, qc])
}
