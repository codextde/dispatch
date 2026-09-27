"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiClientError } from "@/lib/api-client"
import { escapeHtml, renderTemplate } from "@/lib/inbox/templates"
import { isEmail, memberName } from "@/lib/inbox/format"
import type { DraftInfo, DraftMode, Participant, SendResult } from "@/lib/inbox/types"
import { inboxKeys } from "@/hooks/inbox/queries"
import { inboxUI } from "@/hooks/inbox/store"
import { useOrg } from "@/components/app/org-provider"
import { useInbox } from "../inbox-provider"

export type EmailDraftState = {
  id: string | null
  version: number
  conversationId: string | null
  mode: DraftMode
  replyToMessageId: string | null
  accountId: string | null
  fromEmail: string
  to: Participant[]
  cc: Participant[]
  bcc: Participant[]
  subject: string
  /** Editor HTML (without signature) */
  body: string
  signatureId: string | null
  isShared: boolean
}

const SIGNATURE_MARKER = '<div class="dispatch-signature"'

/** Split stored draft HTML into editor body + signature id. */
export function splitSignature(html: string): { body: string; signatureId: string | null | undefined } {
  const idx = html.indexOf(SIGNATURE_MARKER)
  if (idx < 0) return { body: html, signatureId: undefined }
  const id = html.slice(idx).match(/data-signature-id="([^"]+)"/)?.[1] ?? null
  return { body: html.slice(0, idx).replace(/(<p><\/p>|<br\s*\/?>)+$/i, ""), signatureId: id }
}

export function draftFromInfo(info: DraftInfo, fallbackSignature: string | null): EmailDraftState {
  const { body, signatureId } = splitSignature(info.html)
  return {
    id: info.id,
    version: info.version,
    conversationId: info.conversationId,
    mode: info.mode,
    replyToMessageId: info.replyToMessageId,
    accountId: info.accountId,
    fromEmail: info.fromEmail,
    to: info.to,
    cc: info.cc,
    bcc: info.bcc,
    subject: info.subject,
    body,
    signatureId: signatureId === undefined ? fallbackSignature : signatureId,
    isShared: info.isShared,
  }
}

type Options = {
  initial: EmailDraftState
  attachmentIds: string[]
  /** Replace the editor content (after conflicts / remote updates / undo) */
  onRemoteContent: (body: string) => void
  onResetAttachments: (info: DraftInfo) => void
  /** Called after a successful send (the composer closes/resets itself) */
  onSent: (result: SendResult, opts: { close: boolean }) => void
}

const SAVE_DELAY = 1200

/**
 * Draft lifecycle for email composers: debounced autosave (create → update
 * with optimistic concurrency), conflict resolution for shared drafts,
 * send (queued with undo window / scheduled) and discard.
 */
export function useEmailDraft({ initial, attachmentIds, onRemoteContent, onResetAttachments, onSent }: Options) {
  const { slug, member, signature, bootstrap } = useInbox()
  const { org } = useOrg()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<EmailDraftState>(initial)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const state = useRef({ draft: initial, attachmentIds, dirty: false, inflight: null as Promise<void> | null, timer: null as ReturnType<typeof setTimeout> | null, touched: !!initial.id })
  const cbs = useRef({ onRemoteContent, onResetAttachments, onSent })
  useEffect(() => {
    cbs.current = { onRemoteContent, onResetAttachments, onSent }
  })

  const signatureHtml = useCallback(
    (id: string | null) => {
      const sig = signature(id)
      if (!sig) return ""
      const me = bootstrap.me
      const rendered = renderTemplate(sig.body, { user: { name: me.name, email: me.email, title: me.title }, org: { name: org.name } })
      return `${SIGNATURE_MARKER} data-signature-id="${escapeHtml(sig.id)}"><br>${rendered}</div>`
    },
    [signature, bootstrap.me, org.name]
  )

  const fullHtml = useCallback((d: EmailDraftState) => `${d.body}${d.signatureId ? signatureHtml(d.signatureId) : ""}`, [signatureHtml])

  const payload = useCallback(
    (d: EmailDraftState) => ({
      conversationId: d.conversationId ?? undefined,
      mode: d.mode,
      replyToMessageId: d.replyToMessageId ?? undefined,
      accountId: d.accountId ?? undefined,
      fromEmail: d.fromEmail,
      to: d.to.filter((p) => isEmail(p.email)),
      cc: d.cc.filter((p) => isEmail(p.email)),
      bcc: d.bcc.filter((p) => isEmail(p.email)),
      subject: d.subject,
      html: fullHtml(d),
      attachmentIds: state.current.attachmentIds,
      isShared: d.isShared,
    }),
    [fullHtml]
  )

  const applyServer = useCallback(
    (info: DraftInfo, reason?: string) => {
      const next = draftFromInfo(info, state.current.draft.signatureId)
      state.current.draft = next
      state.current.dirty = false
      setDraft(next)
      cbs.current.onRemoteContent(next.body)
      cbs.current.onResetAttachments(info)
      if (reason) toast.info(reason)
    },
    []
  )

  const save = useCallback(async () => {
    if (state.current.timer) clearTimeout(state.current.timer)
    state.current.timer = null
    if (state.current.inflight) await state.current.inflight
    if (!state.current.dirty || !state.current.touched) return
    const d = state.current.draft
    if (!d.accountId) return
    state.current.dirty = false
    setSaving(true)
    const run = (async () => {
      try {
        const info = d.id
          ? await api.put<DraftInfo>(`/api/w/${slug}/drafts/${d.id}`, { ...payload(d), version: d.version })
          : await api.post<DraftInfo>(`/api/w/${slug}/drafts`, payload(d))
        const current = state.current.draft
        const next = { ...current, id: info.id, version: info.version, conversationId: info.conversationId }
        state.current.draft = next
        setDraft(next)
        setLastSavedAt(new Date())
        if (!d.id) {
          void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
          if (d.conversationId) void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, d.conversationId) })
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "draft_conflict" && err.details) {
          const info = err.details as DraftInfo
          applyServer(info, `${memberName(member(info.lastEditedBy), "A teammate")} updated this draft`)
        } else if (err instanceof ApiClientError && err.status === 404) {
          // Draft was sent or discarded elsewhere: start over as a new draft.
          state.current.draft = { ...state.current.draft, id: null, version: 0 }
          state.current.dirty = true
        } else {
          state.current.dirty = true
          toast.error(err instanceof Error ? `Draft not saved: ${err.message}` : "Draft not saved")
        }
      } finally {
        setSaving(false)
      }
    })()
    state.current.inflight = run
    await run
    state.current.inflight = null
  }, [slug, payload, qc, applyServer, member])

  const schedule = useCallback(() => {
    if (state.current.timer) clearTimeout(state.current.timer)
    state.current.timer = setTimeout(() => void save(), SAVE_DELAY)
  }, [save])

  const update = useCallback(
    (patch: Partial<EmailDraftState>, opts: { touch?: boolean } = {}) => {
      const next = { ...state.current.draft, ...patch }
      state.current.draft = next
      state.current.dirty = true
      if (opts.touch !== false) state.current.touched = true
      setDraft(next)
      schedule()
    },
    [schedule]
  )

  // Attachments changed → save
  const attKey = attachmentIds.join(",")
  useEffect(() => {
    const prev = state.current.attachmentIds.join(",")
    state.current.attachmentIds = attachmentIds
    if (prev !== attKey && (attachmentIds.length || state.current.draft.id)) {
      state.current.dirty = true
      state.current.touched = true
      schedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by ids
  }, [attKey, schedule])

  // Flush pending changes when the composer unmounts.
  useEffect(() => {
    const s = state.current
    return () => {
      if (s.timer) {
        clearTimeout(s.timer)
        s.timer = null
        if (s.dirty && s.touched) void save()
      }
    }
  }, [save])

  /** Apply a newer server version (shared drafts edited by teammates). */
  const syncRemote = useCallback(
    (info: DraftInfo | undefined) => {
      if (!info || info.id !== state.current.draft.id) return
      if (info.version <= state.current.draft.version || state.current.dirty) return
      applyServer(info)
    },
    [applyServer]
  )

  const discard = useCallback(async () => {
    if (state.current.timer) clearTimeout(state.current.timer)
    state.current.timer = null
    state.current.dirty = false
    if (state.current.inflight) await state.current.inflight
    const id = state.current.draft.id
    if (!id) return
    try {
      await api.delete(`/api/w/${slug}/drafts/${id}`)
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 404)) throw err
    }
    state.current.draft = { ...state.current.draft, id: null, version: 0 }
    void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
    void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
    const cid = state.current.draft.conversationId
    if (cid) void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, cid) })
  }, [slug, qc])

  const send = useCallback(
    async (opts: { close?: boolean; sendAt?: Date } = {}) => {
      if (state.current.timer) clearTimeout(state.current.timer)
      state.current.timer = null
      if (state.current.inflight) await state.current.inflight
      const d = state.current.draft
      const recipients = [...d.to, ...d.cc, ...d.bcc]
      const invalid = recipients.filter((p) => !isEmail(p.email))
      if (!recipients.length) return void toast.error("Add at least one recipient")
      if (invalid.length) return void toast.error(`Invalid address: ${invalid[0]!.email}`)
      if (!d.accountId) return void toast.error("Choose an inbox to send from")
      if (d.mode === "new" && !d.subject.trim()) return void toast.error("Add a subject")
      setSending(true)
      try {
        const body = { ...payload(d), draftId: d.id ?? undefined, sendAt: opts.sendAt?.toISOString(), closeAfter: !!opts.close }
        const result =
          d.mode === "new"
            ? await api.post<SendResult>(`/api/w/${slug}/conversations`, body)
            : await api.post<SendResult>(`/api/w/${slug}/conversations/${d.conversationId}/messages`, body)
        state.current.dirty = false
        state.current.touched = false
        state.current.draft = { ...state.current.draft, id: null, version: 0 }
        void qc.invalidateQueries({ queryKey: inboxKeys.thread(slug, result.conversationId) })
        void qc.invalidateQueries({ queryKey: inboxKeys.lists(slug) })
        void qc.invalidateQueries({ queryKey: inboxKeys.counts(slug) })
        showSendToast(slug, result, { onUndone: (info) => reopenDraft(info) })
        cbs.current.onSent(result, { close: !!opts.close })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send")
      } finally {
        setSending(false)
      }
    },
    [slug, payload, qc]
  )

  return { draft, update, save, send, discard, syncRemote, saving, sending, lastSavedAt, signatureHtml }
}

/** After an undo: bring the draft back into a composer. */
export function reopenDraft(info: DraftInfo) {
  if (info.mode === "new") inboxUI.openCompose({ draftId: info.id })
  else inboxUI.openComposer(info.conversationId, info.mode)
}

/**
 * "Sending…" toast with a live countdown and Undo while the message waits in
 * the undo window; scheduled messages get a confirmation with Cancel.
 */
export function showSendToast(slug: string, result: SendResult, { onUndone }: { onUndone: (draft: DraftInfo) => void }) {
  const cancel = async (id: string | number) => {
    try {
      const info = await api.post<DraftInfo>(`/api/w/${slug}/messages/${result.message.id}/cancel`)
      toast.success(result.undoUntil ? "Sending undone" : "Scheduled message canceled", { id })
      onUndone(info)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Too late to undo", { id })
    }
  }
  if (result.message.status === "scheduled") {
    const when = new Date(result.message.sendAt!).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    const id = toast.success(`Scheduled for ${when}`, { action: { label: "Cancel", onClick: () => void cancel(id) }, duration: 8000 })
    return
  }
  if (!result.undoUntil) return
  const until = new Date(result.undoUntil).getTime()
  const seconds = () => Math.max(0, Math.ceil((until - Date.now()) / 1000))
  if (seconds() <= 0) {
    toast.success("Message sent")
    return
  }
  const undo = () => {
    clearInterval(timer)
    void cancel(id)
  }
  const id = toast.loading(`Sending in ${seconds()}s…`, { action: { label: "Undo", onClick: undo }, duration: Infinity })
  const timer = setInterval(() => {
    const s = seconds()
    if (s <= 0) {
      clearInterval(timer)
      toast.dismiss(id)
      toast.success("Message sent")
      return
    }
    toast.loading(`Sending in ${s}s…`, { id, action: { label: "Undo", onClick: undo }, duration: Infinity })
  }, 500)
}
