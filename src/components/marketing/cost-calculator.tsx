"use client"

import { useId, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { ClientPricing } from "./lib/pricing"

type Rival = { name: string; plan: string; price: number }

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

/** Team-size slider comparing per-seat tools with Dispatch's flat price. */
export function CostCalculator({ pricing, rivals }: { pricing: ClientPricing; rivals: Rival[] }) {
  const [team, setTeam] = useState(12)
  const labelId = useId()
  const cloudMonthly = pricing.interval === "year" ? pricing.amount / 12 : pricing.amount
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: pricing.currency,
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      }).format(n)
    } catch {
      return `${n.toFixed(0)} ${pricing.currency}`
    }
  }

  const rows = [
    ...rivals.map((r) => ({ name: r.name, sub: `${r.plan} · ${usd(r.price)}/user`, monthly: r.price * team, label: usd(r.price * team), ours: false })),
    { name: "Dispatch Cloud", sub: `${pricing.perInterval} per workspace`, monthly: cloudMonthly, label: fmt(cloudMonthly), ours: true },
    { name: "Dispatch self-hosted", sub: "Your own server", monthly: 0, label: fmt(0), ours: true },
  ]
  const max = Math.max(...rows.map((r) => r.monthly), 1)
  const reference = rivals[0]
  const yearlySaving = reference ? (reference.price * team - cloudMonthly) * 12 : 0
  const sameCurrency = pricing.currency === "USD"

  return (
    <div className="rounded-[8px] border border-border bg-card">
      <div className="grid gap-8 border-b border-border p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div>
          <div id={labelId} className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Team size
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[56px] leading-none font-semibold tracking-display tabular-nums">{team}</span>
            <span className="text-muted-foreground">{team === 1 ? "person" : "people"}</span>
          </div>
        </div>
        <div>
          <Slider
            aria-labelledby={labelId}
            min={1}
            max={100}
            step={1}
            value={[team]}
            onValueChange={(v) => setTeam(v[0] ?? 1)}
            className="py-3 [&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-brand [&_[data-slot=slider-track]]:h-1.5"
          />
          <div className="mt-2 flex justify-between font-mono text-[10.5px] text-muted-foreground">
            <span>1</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>
      </div>
      <ul className="space-y-4 p-6 sm:p-8" aria-live="polite">
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[200px_1fr_110px]">
            <div>
              <div className={cn("text-[14px] font-medium", r.ours && "font-semibold")}>{r.name}</div>
              <div className="text-[12px] text-muted-foreground">{r.sub}</div>
            </div>
            <div className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-surface sm:order-none sm:col-span-1">
              <div
                className={cn("h-full rounded-full transition-[width] duration-300 ease-out", r.ours ? "bg-brand" : "bg-foreground/70")}
                style={{ width: `${Math.max((r.monthly / max) * 100, r.monthly > 0 ? 1.5 : 0)}%` }}
              />
            </div>
            <div className={cn("text-right text-[15px] tabular-nums", r.ours ? "font-semibold" : "text-foreground/80")}>
              {r.label}
              <span className="text-[12px] font-normal text-muted-foreground">/mo</span>
            </div>
          </li>
        ))}
      </ul>
      {reference && sameCurrency && (
        <div className="border-t border-border bg-brand-soft/50 px-6 py-4 text-[14px] sm:px-8">
          {yearlySaving > 0 ? (
            <>
              With {team} {team === 1 ? "person" : "people"}, Dispatch Cloud costs{" "}
              <strong className="font-semibold tabular-nums">{usd(yearlySaving)} less per year</strong> than{" "}
              {reference.name} {reference.plan}. Self-hosting saves the full {usd(reference.price * team * 12)}.
            </>
          ) : (
            <>
              For very small teams per-seat tools can be cheaper, but Dispatch stays at {pricing.perInterval} however
              large your team grows, and self-hosting is always free.
            </>
          )}
        </div>
      )}
    </div>
  )
}
