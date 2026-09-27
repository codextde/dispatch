import { json, requireApiOrg, route } from "@/server/api"
import { resolveAiConfig } from "@/server/ai"

type P = { slug: string }

/** GET /api/w/[slug]/ai/status → { enabled, provider, model, source, canConfigure } */
export const GET = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const config = await resolveAiConfig(ctx.org.id)
  return json({
    enabled: Boolean(config) && !ctx.locked,
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    source: config?.source ?? null,
    canConfigure: ctx.permissions.has("settings.manage"),
  })
})
