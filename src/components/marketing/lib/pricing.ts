import "server-only"
import { getSettings } from "@/server/settings"

/**
 * The hosted plan as configured by the instance's super admin
 * (Admin → Billing). Falls back to $50 / month with a 14-day trial.
 */
export type CloudPricing = {
  /** Major currency units, e.g. 50 */
  amount: number
  /** ISO code, upper case */
  currency: string
  interval: "month" | "year"
  trialDays: number
  /** "$50" */
  price: string
  /** "$50/month" */
  perInterval: string
  /** Formats any amount in the configured currency */
  format: (value: number) => string
}

const FALLBACK = { amount: 5000, currency: "usd", interval: "month" as const, trialDays: 14 }

export async function getCloudPricing(): Promise<CloudPricing> {
  let billing: { amount: number; currency: string; interval: "month" | "year"; trialDays: number } = FALLBACK
  try {
    billing = await getSettings("billing")
  } catch {
    billing = FALLBACK
  }
  const cents = Number.isFinite(billing.amount) && billing.amount > 0 ? billing.amount : FALLBACK.amount
  const currency = (billing.currency || FALLBACK.currency).toUpperCase()
  const amount = cents / 100
  const format = makeFormatter(currency)
  const price = format(amount)
  return {
    amount,
    currency,
    interval: billing.interval,
    trialDays: billing.trialDays,
    price,
    perInterval: `${price}/${billing.interval}`,
    format,
  }
}

function makeFormatter(currency: string) {
  return (value: number) => {
    const whole = Math.round(value * 100) % 100 === 0
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      }).format(value)
    } catch {
      return `${whole ? value.toFixed(0) : value.toFixed(2)} ${currency}`
    }
  }
}

/** Replace `{{cloudPrice}}` tokens in content strings. */
export function fillPrice(text: string, p: CloudPricing): string {
  return text
    .replaceAll("{{cloudPrice}} / month", `${p.price} / ${p.interval}`)
    .replaceAll("{{cloudPrice}}", p.perInterval)
    .replaceAll("{{trialDays}}", String(p.trialDays))
}

/** Plain, serialisable subset for client components. */
export function clientPricing(p: CloudPricing) {
  return {
    amount: p.amount,
    currency: p.currency,
    interval: p.interval,
    trialDays: p.trialDays,
    price: p.price,
    perInterval: p.perInterval,
  }
}
export type ClientPricing = ReturnType<typeof clientPricing>
