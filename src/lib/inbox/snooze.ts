import { addDays, addHours, format, nextMonday, nextSaturday, set } from "date-fns"

export type TimePreset = { id: string; label: string; date: Date; hint: string }

const at = (d: Date, hours: number, minutes = 0) => set(d, { hours, minutes, seconds: 0, milliseconds: 0 })

/** Snooze / send-later presets relative to `now` (local time). */
export function timePresets(now = new Date()): TimePreset[] {
  const presets: TimePreset[] = []
  const hour = now.getHours()
  const laterToday = hour < 15 ? at(now, 18) : addHours(set(now, { minutes: 0, seconds: 0, milliseconds: 0 }), 3)
  if (laterToday.getDate() === now.getDate() && laterToday.getTime() - now.getTime() > 30 * 60_000) {
    presets.push({ id: "later", label: "Later today", date: laterToday, hint: format(laterToday, "HH:mm") })
  }
  const tomorrow = at(addDays(now, 1), 9)
  presets.push({ id: "tomorrow", label: "Tomorrow", date: tomorrow, hint: format(tomorrow, "EEE HH:mm") })
  const day = now.getDay()
  if (day >= 1 && day <= 4) {
    const weekend = at(nextSaturday(now), 9)
    presets.push({ id: "weekend", label: "This weekend", date: weekend, hint: format(weekend, "EEE HH:mm") })
  }
  const monday = at(nextMonday(now), 9)
  presets.push({ id: "next-week", label: "Next week", date: monday, hint: format(monday, "EEE d MMM, HH:mm") })
  const month = at(addDays(now, 30), 9)
  presets.push({ id: "month", label: "In a month", date: month, hint: format(month, "d MMM") })
  return presets
}

/** Combine a calendar day and "HH:mm" into a Date (local time). */
export function combineDateTime(day: Date, time: string): Date {
  const [h, m] = time.split(":").map((v) => Number.parseInt(v, 10))
  return set(day, { hours: Number.isFinite(h) ? h! : 9, minutes: Number.isFinite(m) ? m! : 0, seconds: 0, milliseconds: 0 })
}
