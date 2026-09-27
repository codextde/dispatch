import type { Competitor } from "@/content/marketing/types"

type PlanSource = Pick<Competitor, "plans" | "referencePlan">

/** List price of the plan used for comparisons. */
export function referencePrice(c: PlanSource): number {
  return c.plans.find((p) => p.name === c.referencePlan)?.price ?? c.plans[0]?.price ?? 0
}

/**
 * The plan a team of `users` would actually need: the reference plan, or the
 * next tier up when the team exceeds that plan's seat cap.
 */
export function planForTeam(c: PlanSource, users: number) {
  const start = Math.max(0, c.plans.findIndex((p) => p.name === c.referencePlan))
  const fits = c.plans.slice(start).find((p) => p.maxUsers === undefined || users <= p.maxUsers)
  return fits ?? c.plans[c.plans.length - 1]!
}
