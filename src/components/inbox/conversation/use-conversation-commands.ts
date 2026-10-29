"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { applyPatch, stillMatches } from "@/lib/inbox/match"
import { untilLabel } from "@/lib/inbox/format"
import type { ConversationDetail, ConversationPatch } from "@/lib/inbox/types"
import { inboxKeys } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { useConversationActions } from "@/hooks/inbox/use-conversation-actions"
import { useInbox } from "../inbox-provider"
import { useI18n } from "@/lib/i18n"

/**
 * All actions available on an open conversation (header buttons, keyboard
 * shortcuts, mobile action bar). Actions that remove the conversation from
 * the current list advance to the next conversation (Superhuman-style).
 */
export function useConversationCommands(conv: ConversationDetail | undefined, box: string) {
  const { slug, meId, bootstrap } = useInbox()
  const { locale } = useI18n()
  const router = useRouter()
  const qc = useQueryClient()
  const { run } = useConversationActions()
  const id = conv?.id

  const listHref = `/w/${slug}/${box}`
  const nextHref = useCallback(() => {
    const ids = inboxUI.get().listIds
    const idx = id ? ids.indexOf(id) : -1
    const next = idx >= 0 ? (ids[idx + 1] ?? ids[idx - 1]) : undefined
    return next ? `/w/${slug}/${box}/${next}` : listHref
  }, [id, slug, box, listHref])

  /** Apply a patch; if the conversation leaves the visible list, open the next one. */
  const apply = useCallback(
    (patch: ConversationPatch, undo?: string) => {
      if (!conv) return
      const { listBox, listFilters } = inboxUI.get()
      const leaves = listBox === box && !stillMatches(box, listFilters, applyPatch(conv, patch), { meId, accounts: bootstrap.accounts })
      const target = leaves ? nextHref() : null
      run([conv.id], patch, { undo })
      if (target) router.replace(target)
    },
    [conv, box, meId, bootstrap.accounts, nextHref, run, router]
  )

  const del = useMutation({
    mutationFn: () => api.delete(`/api/w/${slug}/conversations/${id}`),
    onSuccess: () => {
      toast.success(locale === "it" ? "Conversazione eliminata definitivamente" : "Conversation deleted permanently")
      router.replace(nextHref())
      void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
      void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
    },
    onError: (err) => toast.error(err.message),
  })

  return useMemo(() => {
    if (!conv) return null
    const assigned = conv.assigneeIds.includes(meId)
    return {
      toggleStatus: () =>
        conv.status === "closed" ? apply({ status: "open" }, locale === "it" ? "Conversazione riaperta" : "Conversation reopened") : apply({ status: "closed" }, locale === "it" ? "Conversazione chiusa" : "Conversation closed"),
      toggleStar: () => run([conv.id], { starred: !conv.starred }),
      togglePin: () => run([conv.id], { pinned: !conv.pinned }, { undo: conv.pinned ? (locale === "it" ? "Rimossa dai fissati" : "Unpinned") : (locale === "it" ? "Fissata in alto" : "Pinned to the top") }),
      togglePriority: () => run([conv.id], { priority: !conv.priority }),
      toggleFollow: () => run([conv.id], { following: !conv.following }, { undo: conv.following ? (locale === "it" ? "Non riceverai più notifiche" : "You'll no longer be notified") : (locale === "it" ? "Riceverai notifiche sulle nuove attività" : "You'll be notified about new activity") }),
      toggleMute: () => run([conv.id], { muted: !conv.muted }, { undo: conv.muted ? (locale === "it" ? "Notifiche riattivate" : "Unmuted") : (locale === "it" ? "Silenziata — notifiche disattivate" : "Muted — no more notifications") }),
      snooze: (until: Date | null) => apply({ snoozedUntil: until ? until.toISOString() : null }, until ? `${locale === "it" ? "Posticipata fino a" : "Snoozed until"} ${untilLabel(until.toISOString(), locale)}` : (locale === "it" ? "Posticipo rimosso" : "Unsnoozed")),
      toggleAssignee: (userId: string, assign: boolean) => run([conv.id], assign ? { addAssigneeIds: [userId] } : { removeAssigneeIds: [userId] }),
      assignToMe: () => (assigned ? run([conv.id], { removeAssigneeIds: [meId] }, { undo: locale === "it" ? "Assegnazione rimossa" : "Unassigned" }) : run([conv.id], { addAssigneeIds: [meId] }, { undo: locale === "it" ? "Assegnata a te" : "Assigned to you" })),
      toggleLabel: (labelId: string, add: boolean) => run([conv.id], add ? { addLabelIds: [labelId] } : { removeLabelIds: [labelId] }),
      moveToTeam: (teamId: string | null) => apply({ teamId }, locale === "it" ? "Spostata" : "Moved"),
      rename: (subject: string | null) => run([conv.id], { subject }),
      markUnread: () => {
        run([conv.id], { read: false })
        router.push(listHref)
      },
      markRead: () => run([conv.id], { read: true }),
      toggleSpam: () => apply({ spam: !conv.isSpam }, conv.isSpam ? (locale === "it" ? "Contrassegnata come non spam" : "Marked as not spam") : (locale === "it" ? "Contrassegnata come spam" : "Marked as spam")),
      toggleTrash: () => apply({ trash: !conv.isTrash }, conv.isTrash ? (locale === "it" ? "Ripristinata dal cestino" : "Restored from trash") : (locale === "it" ? "Spostata nel cestino" : "Moved to trash")),
      deleteForever: () => del.mutate(),
      copyLink: () => {
        void navigator.clipboard.writeText(`${window.location.origin}/w/${slug}/all/${conv.id}`)
        toast.success(locale === "it" ? "Link copiato" : "Link copied")
      },
      print: () => window.print(),
      back: () => router.push(listHref),
      nextHref,
    }
  }, [conv, meId, apply, run, router, listHref, del, slug, nextHref, locale])
}

export type ConversationCommands = NonNullable<ReturnType<typeof useConversationCommands>>
