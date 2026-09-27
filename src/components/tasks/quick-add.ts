/**
 * Natural quick-add parsing for tasks:
 *
 *   "Call Hannah back @maya tomorrow #support"
 *   → { title: "Call Hannah back", assignee: Maya, team: Support, due: tomorrow 17:00 }
 *
 * Supported tokens (anywhere in the text, as separate words):
 *   @name / @me                    assignee (first name, full name without spaces or email prefix)
 *   #team                          team (name prefix)
 *   today, tod, tonight, eod       due today
 *   tomorrow, tmr, tmrw            due tomorrow
 *   mon … sun, monday … sunday     next occurrence ("next fri" skips a week)
 *   next week                      next Monday
 *   in 3 days / in 2 weeks         relative
 *   2026-10-03                     ISO date
 */

export type QuickAddMember = { id: string; name: string | null; email: string }
export type QuickAddTeam = { id: string; name: string }
export type QuickAddResult = {
  title: string
  assignee?: QuickAddMember
  team?: QuickAddTeam
  dueAt?: Date
  dueLabel?: string
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const DUE_HOUR = 17

function atDueHour(d: Date) {
  const out = new Date(d)
  out.setHours(DUE_HOUR, 0, 0, 0)
  return out
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Default due time for a picked calendar day (end of the working day). */
export function dueOn(day: Date) {
  return atDueHour(day)
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

export function matchMember(token: string, members: QuickAddMember[], meId?: string): QuickAddMember | undefined {
  const t = normalize(token)
  if (!t) return undefined
  if (t === "me" && meId) return members.find((m) => m.id === meId)
  const keys = (m: QuickAddMember) => {
    const name = m.name ?? ""
    return [normalize(name.split(/\s+/)[0] ?? ""), normalize(name), normalize(m.email.split("@")[0] ?? "")]
  }
  return (
    members.find((m) => keys(m).some((k) => k === t)) ??
    members.find((m) => keys(m).some((k) => k.length > 0 && k.startsWith(t)))
  )
}

export function matchTeam(token: string, teams: QuickAddTeam[]): QuickAddTeam | undefined {
  const t = normalize(token)
  if (!t) return undefined
  return teams.find((x) => normalize(x.name) === t) ?? teams.find((x) => normalize(x.name).startsWith(t))
}

type DateMatch = { re: RegExp; resolve: (m: RegExpMatchArray, now: Date) => { date: Date; label: string } | null }

const DATE_PATTERNS: DateMatch[] = [
  {
    re: /(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/i,
    resolve: (m) => {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : { date: atDueHour(d), label: "" }
    },
  },
  {
    re: /(?:^|\s)in\s+(\d{1,3})\s+(days?|weeks?)(?=\s|$)/i,
    resolve: (m, now) => {
      const n = Number(m[1]) * (m[2]!.toLowerCase().startsWith("week") ? 7 : 1)
      return { date: atDueHour(addDays(now, n)), label: "" }
    },
  },
  {
    re: /(?:^|\s)next\s+week(?=\s|$)/i,
    resolve: (_m, now) => {
      const days = ((8 - now.getDay()) % 7) || 7
      return { date: atDueHour(addDays(now, days)), label: "Next week" }
    },
  },
  {
    re: /(?:^|\s)(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?(?=\s|$)/i,
    resolve: (m, now) => {
      const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[2]!.toLowerCase()))
      if (idx < 0) return null
      let days = (idx - now.getDay() + 7) % 7 || 7
      if (m[1]) days += days < 7 ? 7 : 0
      return { date: atDueHour(addDays(now, days)), label: "" }
    },
  },
  {
    re: /(?:^|\s)(tomorrow|tmrw?|tmr)(?=\s|$)/i,
    resolve: (_m, now) => ({ date: atDueHour(addDays(now, 1)), label: "Tomorrow" }),
  },
  {
    re: /(?:^|\s)(today|tod|tonight|eod)(?=\s|$)/i,
    resolve: (_m, now) => ({ date: atDueHour(now), label: "Today" }),
  },
]

export function parseQuickAdd(
  input: string,
  opts: { members?: QuickAddMember[]; teams?: QuickAddTeam[]; meId?: string; now?: Date } = {}
): QuickAddResult {
  const now = opts.now ?? new Date()
  let text = ` ${input} `
  const result: QuickAddResult = { title: "" }

  text = text.replace(/(^|\s)@([\p{L}\p{N}._-]+)(?=\s|$)/gu, (whole, lead: string, token: string) => {
    if (result.assignee) return whole
    const m = matchMember(token, opts.members ?? [], opts.meId)
    if (!m) return whole
    result.assignee = m
    return lead
  })
  text = text.replace(/(^|\s)#([\p{L}\p{N}._-]+)(?=\s|$)/gu, (whole, lead: string, token: string) => {
    if (result.team) return whole
    const t = matchTeam(token, opts.teams ?? [])
    if (!t) return whole
    result.team = t
    return lead
  })
  for (const p of DATE_PATTERNS) {
    const m = text.match(p.re)
    if (!m) continue
    const r = p.resolve(m, now)
    if (!r) continue
    result.dueAt = r.date
    result.dueLabel = r.label || undefined
    text = text.replace(m[0], " ")
    break
  }
  result.title = text.replace(/\s+/g, " ").trim()
  return result
}
