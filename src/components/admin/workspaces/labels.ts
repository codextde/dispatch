import type { Tone } from "@/components/admin/ui"

/** Display labels / tones for workspace plans, subscription and inbox states. */

export const PLAN_OPTIONS = [
  { value: "self_hosted", label: "Self-hosted" },
  { value: "free", label: "Free" },
  { value: "cloud", label: "Cloud" },
  { value: "comped", label: "Comped" },
] as const

export const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: "none", label: "None" },
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "unpaid", label: "Unpaid" },
  { value: "incomplete", label: "Incomplete" },
] as const

export type PlanValue = (typeof PLAN_OPTIONS)[number]["value"]
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUS_OPTIONS)[number]["value"]

export function planLabel(plan: string) {
  return PLAN_OPTIONS.find((p) => p.value === plan)?.label ?? plan
}

export function subscriptionLabel(status: string) {
  return SUBSCRIPTION_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

export function subscriptionTone(status: string): Tone {
  switch (status) {
    case "active":
      return "ok"
    case "trialing":
      return "info"
    case "past_due":
    case "incomplete":
      return "warn"
    case "unpaid":
      return "error"
    default:
      return "neutral"
  }
}

export function planTone(plan: string): Tone {
  return plan === "cloud" ? "brand" : plan === "comped" ? "info" : "neutral"
}

export function accountStatusTone(status: string): Tone {
  switch (status) {
    case "active":
      return "ok"
    case "syncing":
    case "pending":
      return "info"
    case "error":
      return "error"
    case "paused":
      return "warn"
    default:
      return "neutral"
  }
}

export const PROVIDER_LABELS: Record<string, string> = {
  imap: "IMAP",
  gmail: "Gmail",
  outlook: "Outlook",
  demo: "Demo",
}
