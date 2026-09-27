import { Check, Minus } from "lucide-react"
import { competitors, PRICES_AS_OF } from "@/content/marketing/competitors"
import type { Competitor } from "@/content/marketing/types"
import { APP_ENTRY } from "@/content/marketing/site"
import { cn } from "@/lib/utils"
import type { CloudPricing } from "./lib/pricing"
import { ButtonLink, MonoLabel } from "./primitives"

export function referencePrice(c: Competitor): number {
  return c.plans.find((p) => p.name === c.referencePlan)?.price ?? c.plans[0]?.price ?? 0
}

/**
 * The plan a team of `users` would actually need: the reference plan, or the
 * next tier up when the team exceeds that plan's seat cap.
 */
export function planForTeam(c: Competitor, users: number) {
  const start = Math.max(0, c.plans.findIndex((p) => p.name === c.referencePlan))
  const fits = c.plans.slice(start).find((p) => p.maxUsers === undefined || users <= p.maxUsers)
  return fits ?? c.plans[c.plans.length - 1]!
}

/** Dispatch Cloud price per month, for comparing with per-seat monthly prices. */
export function monthlyCloud(p: CloudPricing): number {
  return p.interval === "year" ? p.amount / 12 : p.amount
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

/* -------------------------------------------------------------------------- */
/* Plan cards                                                                 */
/* -------------------------------------------------------------------------- */

export function PlanCards({ pricing, compact = false }: { pricing: CloudPricing; compact?: boolean }) {
  const selfHosted = [
    "Every feature, no gated tiers",
    "Unlimited users & workspaces",
    "Runs on your own server",
    "Docker Compose & Coolify",
    "Community support on GitHub",
    "AGPL-3.0 licensed",
  ]
  const cloud = [
    "Everything in Self-hosted",
    "Unlimited users in the workspace",
    "Managed hosting & automatic updates",
    "Daily backups",
    "Email support",
    `${pricing.trialDays}-day free trial, cancel anytime`,
  ]
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <article className="flex flex-col rounded-[8px] border border-border bg-card p-6 sm:p-8">
        <MonoLabel>Self-hosted</MonoLabel>
        <div className="mt-5 flex items-baseline gap-2">
          <span className="text-[44px] leading-none font-semibold tracking-display">Free</span>
          <span className="text-[15px] text-muted-foreground">forever</span>
        </div>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          Run Dispatch on your own infrastructure. Your server, your mail, your rules.
        </p>
        <FeatureList items={compact ? selfHosted.slice(0, 4) : selfHosted} className="mt-7" />
        <div className="mt-auto pt-8">
          <ButtonLink href="/self-hosting" variant="secondary" size="lg" className="w-full" arrow>
            Self-host for free
          </ButtonLink>
        </div>
      </article>

      <article className="mk-dark relative flex flex-col overflow-hidden rounded-[8px] border border-border p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(74,222,128,0.25),transparent)] blur-xl"
        />
        <div className="relative flex items-center justify-between">
          <MonoLabel>Dispatch Cloud</MonoLabel>
          <span className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 font-mono text-[10.5px] tracking-wider text-brand uppercase">
            Hosted for you
          </span>
        </div>
        <div className="relative mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[44px] leading-none font-semibold tracking-display">{pricing.price}</span>
          <span className="text-[15px] text-muted-foreground">/ {pricing.interval} per workspace</span>
        </div>
        <p className="relative mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
          We run it, update it and back it up. One flat price, however big your team gets.
        </p>
        <FeatureList items={compact ? cloud.slice(0, 4) : cloud} className="relative mt-7" />
        <div className="relative mt-auto pt-8">
          <ButtonLink href={APP_ENTRY} size="lg" className="w-full" arrow>
            Start {pricing.trialDays}-day free trial
          </ButtonLink>
        </div>
      </article>
    </div>
  )
}

function FeatureList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-3 text-[14.5px]", className)}>
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-(--brand-ink)">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
          {i}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/* Per-seat comparison                                                        */
/* -------------------------------------------------------------------------- */

const TEAM_SIZES = [5, 10, 25, 50]

/** Cost of Dispatch vs. per-seat tools at a few team sizes. */
export function PerSeatComparison({ pricing, slugs = ["missive", "front", "hiver"] }: { pricing: CloudPricing; slugs?: string[] }) {
  const rivals = slugs.map((s) => competitors.find((c) => c.slug === s)).filter((c): c is Competitor => Boolean(c))
  const cloudMonthly = monthlyCloud(pricing)
  const cols = [
    ...rivals.map((c) => ({
      key: c.slug,
      name: c.name,
      sub: `${c.referencePlan} · ${usd(referencePrice(c))}/user`,
      model: "Per user",
      cost: (n: number) => usd(planForTeam(c, n).price * n),
      openSource: false,
      selfHost: false,
      highlight: false,
    })),
    {
      key: "cloud",
      name: "Dispatch Cloud",
      sub: `${pricing.perInterval} per workspace`,
      model: "Flat per workspace",
      cost: () => pricing.format(cloudMonthly),
      openSource: true,
      selfHost: false,
      highlight: true,
    },
    {
      key: "self",
      name: "Self-hosted",
      sub: "Dispatch on your server",
      model: "Free",
      cost: () => pricing.format(0),
      openSource: true,
      selfHost: true,
      highlight: true,
    },
  ]

  return (
    <div>
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
          <caption className="sr-only">Monthly cost of Dispatch compared with per-seat inbox tools</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[150px] border-b border-border pb-4 align-bottom">
                <MonoLabel>Team size</MonoLabel>
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "border-b border-border px-3 pb-4 align-bottom font-normal",
                    c.highlight && "bg-brand-soft/60",
                    c.key === "cloud" && "rounded-tl-[6px]",
                    c.key === "self" && "rounded-tr-[6px]"
                  )}
                >
                  <div className={cn("pt-4 text-[14.5px] font-semibold", c.highlight && "text-foreground")}>{c.name}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Pricing model" cells={cols.map((c) => ({ v: c.model, h: c.highlight }))} />
            {TEAM_SIZES.map((n) => (
              <Row
                key={n}
                label={`${n} people`}
                cells={cols.map((c) => ({ v: <span className="tabular-nums">{c.cost(n)}</span>, h: c.highlight, strong: true }))}
              />
            ))}
            <Row label="Open source" cells={cols.map((c) => ({ v: <Bool on={c.openSource} />, h: c.highlight }))} />
            <Row label="Self-hosting" cells={cols.map((c) => ({ v: <Bool on={c.selfHost} />, h: c.highlight }))} last />
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
        Monthly cost. Competitor prices as listed publicly in {PRICES_AS_OF} on each vendor&apos;s pricing page (per user,
        billed annually, USD) for the plan shown. Vendors may offer other plans, limits and discounts.
      </p>
    </div>
  )
}

function Row({
  label,
  cells,
  last,
}: {
  label: string
  cells: { v: React.ReactNode; h: boolean; strong?: boolean }[]
  last?: boolean
}) {
  return (
    <tr>
      <th scope="row" className={cn("py-3.5 pr-3 text-[13.5px] font-medium text-muted-foreground", !last && "border-b border-border")}>
        {label}
      </th>
      {cells.map((c, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-3.5",
            !last && "border-b border-border",
            c.h && "bg-brand-soft/60",
            c.strong && (c.h ? "font-semibold text-foreground" : "text-foreground/80")
          )}
        >
          {c.v}
        </td>
      ))}
    </tr>
  )
}

export function Bool({ on, label }: { on: boolean; label?: string }) {
  return on ? (
    <span className="inline-flex items-center gap-1.5 text-(--brand-ink)">
      <Check className="size-4" strokeWidth={2.5} aria-hidden />
      <span className={label ? "text-foreground" : "sr-only"}>{label ?? "Yes"}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Minus className="size-4" aria-hidden />
      <span className={label ? "" : "sr-only"}>{label ?? "No"}</span>
    </span>
  )
}
