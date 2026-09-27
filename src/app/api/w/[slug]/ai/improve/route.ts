import { z } from "zod"
import { json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertAiAvailable, improveText, toApiError } from "@/server/ai"

type P = { slug: string }

const body = z.object({
  text: z.string().min(1).max(20_000),
  mode: z.enum(["fix", "shorter", "longer", "friendlier", "formal"]),
})

/** POST /api/w/[slug]/ai/improve { text, mode } → { text, html } */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const { text, mode } = await parseJson(req, body)
  await assertAiAvailable(ctx)
  try {
    return json(await improveText(ctx.org.id, text, mode))
  } catch (err) {
    throw toApiError(err)
  }
})
