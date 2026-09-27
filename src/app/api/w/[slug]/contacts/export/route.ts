import { z } from "zod"
import { ApiError, parseQuery, requireApiOrg, route } from "@/server/api"
import { searchContacts } from "@/server/contacts"

type P = { slug: string }

const query = z.object({
  q: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  tag: z.string().max(60).optional(),
  scope: z.enum(["all", "shared", "private"]).optional(),
})

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value)
  // Neutralize spreadsheet formulas (CSV injection); plain numbers such as "+1 (503) 555-0142" stay intact
  const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().\-/]+$/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** GET /api/w/[slug]/contacts/export?q&company&tag&scope → text/csv (all matching contacts) */
export const GET = route<P>(async (req, { params }) => {
  const { slug } = await params
  const ctx = await requireApiOrg(req, slug)
  if (!ctx.permissions.has("contacts.manage") && !ctx.permissions.has("conversations.export")) {
    throw new ApiError(403, "You don't have permission to export contacts", "forbidden")
  }
  const filters = parseQuery(req, query)

  const all = []
  for (let offset = 0; offset < 50_000; offset += 500) {
    const { contacts } = await searchContacts(ctx, { ...filters, sort: "name", limit: 500, offset, withTotal: false })
    all.push(...contacts)
    if (contacts.length < 500) break
  }

  const customKeys = [...new Set(all.flatMap((c) => Object.keys(c.customFields ?? {})))].sort()
  const header = ["name", "email", "company", "title", "phone", "tags", "notes", "visibility", "last_contacted_at", "message_count", ...customKeys]
  const lines = [header.map(csvCell).join(",")]
  for (const c of all) {
    lines.push(
      [
        c.name,
        c.email,
        c.company,
        c.title,
        c.phone,
        c.tags.join("; "),
        c.notes,
        c.ownerUserId ? "private" : "shared",
        c.lastContactedAt?.toISOString() ?? "",
        c.messageCount,
        ...customKeys.map((k) => c.customFields?.[k] ?? ""),
      ]
        .map(csvCell)
        .join(",")
    )
  }
  const date = new Date().toISOString().slice(0, 10)
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${slug}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
