import { z } from "zod"
import { json, parseJson, requireApiOrg, route } from "@/server/api"
import { assertAiAvailable, toApiError, translateText } from "@/server/ai"

type P = { slug: string }

const body = z.object({
  text: z.string().min(1).max(20_000),
  language: z.string().trim().min(2).max(60),
})

/** POST /api/w/[slug]/ai/translate { text, language } → { text, html } */
export const POST = route<P>(async (req, { params }) => {
  const ctx = await requireApiOrg(req, (await params).slug)
  const { text, language } = await parseJson(req, body)
  await assertAiAvailable(ctx)
  try {
    return json(await translateText(ctx.org.id, text, language))
  } catch (err) {
    throw toApiError(err)
  }
})
