import type { ChartConfig } from "@/components/ui/chart"

/**
 * Analytics palette, validated with the dataviz validator (lightness band,
 * chroma floor, CVD + normal-vision separation, >= 3:1 on the card surface)
 * for both modes:
 *   light (#ffffff card): #2a78d6 blue, #1f9a52 green
 *   dark  (#1b1b1b card): #3987e5 blue, #2fae62 green
 *
 * Color follows the entity: blue = incoming conversations / messages,
 * green = replies / response speed. The heatmap is a sequential ramp of blue.
 *
 * Apply `vizVars` on a wrapping element; charts reference the CSS variables.
 */
export const vizVars =
  "[--viz-in:#2a78d6] [--viz-out:#1f9a52] dark:[--viz-in:#3987e5] dark:[--viz-out:#2fae62]"

export const volumeConfig = {
  received: { label: "Received", color: "var(--viz-in)" },
  replied: { label: "Replies sent", color: "var(--viz-out)" },
} satisfies ChartConfig

export const responseConfig = {
  medianHours: { label: "Median first response", color: "var(--viz-out)" },
} satisfies ChartConfig

/** Sequential ramp steps (share of the hue mixed into the card surface). */
export const HEAT_STEPS = [16, 34, 54, 76, 100] as const

export function heatColor(step: number): string {
  if (step <= 0) return "var(--muted)"
  const pct = HEAT_STEPS[Math.min(step, HEAT_STEPS.length) - 1]
  return `color-mix(in oklch, var(--viz-in) ${pct}%, var(--card))`
}
