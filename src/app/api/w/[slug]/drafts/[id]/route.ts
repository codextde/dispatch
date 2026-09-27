import { json, parseJson, route } from "@/server/api"
import { assertUuid, inboxContext } from "@/server/conversations/context"
import { discardDraft, draftSchema, getDraft, saveDraft } from "@/server/conversations/messages"

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
  return json(await saveDraft(ctx, scope, assertUuid(id, "Draft"), input))
})

/** DELETE /api/w/[slug]/drafts/[id] → 204 (discard) */
export const DELETE = route<P>(async (req, { params }) => {
  const { slug, id } = await params
  const { ctx, scope } = await inboxContext(req, slug, { write: true })
  await discardDraft(ctx, scope, assertUuid(id, "Draft"))
  return new Response(null, { status: 204 })
})
