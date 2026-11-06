import { after } from "next/server"
import { appendArchiveDraft } from "@/server/mail/archive"
import { rateLimit } from "@/server/rate-limit"
import { z } from "zod"
import { ApiError, json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { buildDraftCopy, discardDraft, draftSchema, getDraft, readLinkedDraftEdit, saveDraft } from "@/server/conversations/messages"

type P = { slug: string; id: string }

/** GET /api/w/[slug]/drafts/[id] → DraftInfo */
export const GET = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug)
  return json(await getDraft(ctx, scope, assertUuid(id, "Draft")))
})

/**
 * PUT /api/w/[slug]/drafts/[id] — autosave. Include `version` (from the last
 * DraftInfo) to detect concurrent edits of shared drafts: 409 + current draft
 * in `error.details` when stale.
 */
export const PUT = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const input = await parseJson(req, draftSchema)
  const saved = await saveDraft(ctx, scope, assertUuid(id, "Draft"), input)
  if (saved.syncToMailServer && saved.authorId === ctx.user.id) {
    after(async () => {
      try {
        const latest = await getDraft(ctx, scope, saved.id)
        if (!latest.syncToMailServer || latest.accountId !== saved.accountId) return
        const { account, source, copyId } = await buildDraftCopy(ctx, scope, latest.id, latest.version)
        await appendArchiveDraft(account, source, copyId, { id: latest.id, version: latest.version })
      } catch (err) {
        if (err instanceof ApiError && [404, 409].includes(err.status)) return
        console.error("[draft-sync] could not copy saved draft", err)
      }
    })
  }
  return json(saved)
})

/** DELETE /api/w/[slug]/drafts/[id] → 204 (discard) */
export const DELETE = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  await discardDraft(ctx, scope, assertUuid(id, "Draft"))
  return new Response(null, { status: 204 })
})

export const POST = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const { version } = await parseJson(req, z.object({ version: z.number().int().min(1) }))
  const limit = await rateLimit(`draft-copy:${ctx.org.id}:${ctx.user.id}`, 8, 60)
  if (!limit.ok) throw new ApiError(429, "Too many draft copies. Try again shortly.", "rate_limited")
  const { account, source, copyId } = await buildDraftCopy(ctx, scope, assertUuid(id, "Draft"), version)
  await appendArchiveDraft(account, source, copyId, { id: assertUuid(id, "Draft"), version })
  return new Response(null, { status: 204 })
})

export const PATCH = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  const limit = await rateLimit(`draft-pull:${ctx.org.id}:${ctx.user.id}`, 15, 60)
  if (!limit.ok) throw new ApiError(429, "Too many draft checks. Try again shortly.", "rate_limited")
  const imported = await readLinkedDraftEdit(ctx, scope, assertUuid(id, "Draft"))
  return json({ draftId: imported?.id ?? null }, { headers: { "Cache-Control": "private, no-store" } })
})
