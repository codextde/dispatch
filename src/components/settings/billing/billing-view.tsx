"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AlertTriangle, Check, CreditCard, ExternalLink, Loader2, Lock, Server, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { useOrg } from "@/components/app/org-provider"
import { Button } from "@/components/ui/button"
import { LocalTime } from "@/components/app/local-time"
import { MicroLabel, SettingsSection, StatusBadge } from "@/components/settings/settings-ui"
import { syncBillingStatus } from "@/server/workspace/actions/billing"
import type { BillingOverview } from "@/server/workspace/queries/billing"
import { cn } from "@/lib/utils"

const INCLUDED = [
  "Unlimited teammates — no per-seat pricing",
  "Unlimited shared & personal inboxes (Gmail, Outlook, any IMAP)",
  "Internal comments, @mentions and assignments",
  "Rules, canned responses and signatures",
  "Team chat, tasks and shared contacts",
  "Analytics and security audit log",
  "REST API and webhooks",
  "Custom roles & permissions",
]

type CloudOverview = Extract<BillingOverview, { mode: "cloud" }>

function formatPrice(price: CloudOverview["price"]) {
  const currency = price.currency.toUpperCase()
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price.amount / 100)
  } catch {
    return `${(price.amount / 100).toFixed(2)} ${currency}`
  }
}

function daysUntil(date: Date | string | null, now: number) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - now) / 86_400_000)
}

function StatusPill({ overview, now }: { overview: CloudOverview; now: number }) {
  const { status } = overview
  if (status === "trialing") {
    const left = daysUntil(overview.trialEndsAt, now)
    if (left !== null && left <= 0) return <StatusBadge tone="danger">Trial ended</StatusBadge>
    return (
      <StatusBadge tone="info">
        Trial{left !== null ? ` · ${left} day${left === 1 ? "" : "s"} left` : ""}
      </StatusBadge>
    )
  }
  if (status === "active") return <StatusBadge tone="success">Active</StatusBadge>
  if (status === "past_due") return <StatusBadge tone="warning">Past due</StatusBadge>
  if (status === "canceled") return <StatusBadge tone="neutral">Canceled</StatusBadge>
  if (status === "unpaid") return <StatusBadge tone="danger">Unpaid</StatusBadge>
  if (status === "incomplete") return <StatusBadge tone="warning">Incomplete</StatusBadge>
  return <StatusBadge tone="neutral">No subscription</StatusBadge>
}

function IncludedList({ className }: { className?: string }) {
  return (
    <ul className={cn("grid gap-x-6 gap-y-2.5 sm:grid-cols-2", className)}>
      {INCLUDED.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[13px]">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Native form post → 303 redirect to Stripe (Checkout or customer portal). */
function StripeButton({
  slug,
  kind,
  children,
  variant = "default",
  disabled,
}: {
  slug: string
  kind: "checkout" | "portal"
  children: React.ReactNode
  variant?: "default" | "outline"
  disabled?: boolean
}) {
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    // Reset when the user comes back via the browser's back button (bfcache)
    const onShow = () => setSubmitting(false)
    window.addEventListener("pageshow", onShow)
    return () => window.removeEventListener("pageshow", onShow)
  }, [])
  return (
    <form method="post" action={`/api/billing/${kind}?slug=${encodeURIComponent(slug)}`} onSubmit={() => setSubmitting(true)}>
      <Button type="submit" variant={variant} disabled={disabled || submitting} className="w-full sm:w-auto">
        {submitting ? <Loader2 className="animate-spin" /> : kind === "portal" ? <ExternalLink /> : <CreditCard />}
        {children}
      </Button>
    </form>
  )
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
  onDismiss,
}: {
  tone: "warning" | "danger" | "info"
  icon: typeof AlertTriangle
  title: string
  children?: React.ReactNode
  onDismiss?: () => void
}) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]",
        tone === "warning" && "border-warning/40 bg-warning/10",
        tone === "danger" && "border-destructive/30 bg-destructive/5",
        tone === "info" && "border-info/30 bg-info/5"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warning" && "text-[color-mix(in_oklch,var(--warning),var(--foreground)_40%)]",
          tone === "danger" && "text-destructive",
          tone === "info" && "text-info"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-pretty text-muted-foreground">{children}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label="Dismiss">
          <X />
        </Button>
      )}
    </div>
  )
}

export function BillingView({
  slug,
  overview,
  error,
  checkout,
  now,
}: {
  slug: string
  overview: BillingOverview
  /** Human-readable message for a known `?error=` code (null otherwise) */
  error: string | null
  checkout: "success" | "canceled" | null
  now: number
}) {
  const { productName } = useOrg()
  const router = useRouter()
  const pathname = usePathname()
  const [dismissedError, setDismissedError] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (!checkout || handled.current) return
    handled.current = true
    if (checkout === "canceled") {
      toast("Checkout canceled — no changes were made.")
      router.replace(pathname, { scroll: false })
      return
    }
    toast.success("Thanks for subscribing! Your workspace is all set.")
    void syncBillingStatus({ slug }).finally(() => {
      router.replace(pathname, { scroll: false })
      router.refresh()
    })
  }, [checkout, pathname, router, slug])

  const dismissError = () => {
    setDismissedError(true)
    router.replace(pathname, { scroll: false })
  }

  if (overview.mode === "self_hosted") {
    return (
      <SettingsSection className="relative">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)] sm:block" />
        <div className="relative flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-brand-soft text-brand">
              <Server className="size-5" />
            </span>
            <div className="min-w-0">
              <MicroLabel>Current plan</MicroLabel>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Self-hosted <span className="text-quiet">— free forever</span>
              </h2>
              <p className="mt-1.5 max-w-lg text-[13px] text-pretty text-muted-foreground">
                This instance runs {productName} on your own infrastructure. Every feature is included, with no limits on users or
                inboxes — nothing to pay, nothing to manage here.
              </p>
            </div>
          </div>
          <div className="rounded-lg border bg-surface/50 p-4">
            <MicroLabel className="mb-3 block">Everything included</MicroLabel>
            <IncludedList />
          </div>
        </div>
      </SettingsSection>
    )
  }

  const o = overview
  const freePlan = o.plan === "comped" || o.plan === "free" || o.plan === "self_hosted"
  const trialLeft = o.status === "trialing" ? daysUntil(o.trialEndsAt, now) : null
  const canSubscribe = !freePlan && !o.hasLiveSubscription
  const canManage = o.hasCustomer
  const price = formatPrice(o.price)

  return (
    <div className="flex flex-col gap-6">
      {error && !dismissedError && (
        <Notice tone="danger" icon={AlertTriangle} title="Something went wrong" onDismiss={dismissError}>
          {error}
        </Notice>
      )}
      {!o.configured && !freePlan && (
        <Notice tone="info" icon={Sparkles} title="Billing isn't set up yet">
          The instance administrator still needs to connect Stripe. Until then subscriptions can&apos;t be started.
        </Notice>
      )}
      {o.locked && o.locked.reason === "billing" && (
        <Notice tone="danger" icon={Lock} title="This workspace is read-only">
          {o.locked.message} Subscribe to restore full access — your data is safe.
        </Notice>
      )}
      {o.status === "past_due" && (
        <Notice tone="warning" icon={AlertTriangle} title="Your last payment failed">
          Update your payment method to avoid interruption. Stripe retries the charge automatically.
        </Notice>
      )}

      <SettingsSection
        footer={
          freePlan ? undefined : (
            <>
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> Payments are processed securely by Stripe.
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {canManage && (
                  <StripeButton slug={slug} kind="portal" variant={canSubscribe ? "outline" : "default"} disabled={!o.configured}>
                    Manage billing
                  </StripeButton>
                )}
                {canSubscribe && (
                  <StripeButton slug={slug} kind="checkout" disabled={!o.configured}>
                    {o.status === "canceled" ? "Resubscribe" : "Subscribe"}
                  </StripeButton>
                )}
              </div>
            </>
          )
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <MicroLabel>Current plan</MicroLabel>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {freePlan ? (
                  <>
                    {o.plan === "comped" ? "Complimentary" : "Free"} <span className="text-quiet">plan</span>
                  </>
                ) : (
                  <>
                    {productName} <span className="text-quiet">Cloud</span>
                  </>
                )}
              </h2>
              {freePlan ? (
                <p className="mt-1.5 max-w-lg text-[13px] text-pretty text-muted-foreground">
                  {o.plan === "comped"
                    ? "This workspace is provided free of charge by the instance administrator. Every feature is included."
                    : "This workspace isn't billed. Every feature is included."}
                </p>
              ) : (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{price}</span>
                  <span className="text-sm text-muted-foreground">/ {o.price.interval} · unlimited users</span>
                </p>
              )}
            </div>
            {!freePlan && <StatusPill overview={o} now={now} />}
            {freePlan && <StatusBadge tone="success">Active</StatusBadge>}
          </div>

          {!freePlan && (
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="mt-1 text-sm font-medium">
                  {o.status === "trialing"
                    ? "Free trial"
                    : o.status === "none"
                      ? "Not subscribed"
                      : o.status === "past_due"
                        ? "Payment overdue"
                        : o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                </dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">
                  {o.status === "trialing" ? "Trial ends" : o.status === "canceled" ? "Access ended" : "Renews on"}
                </dt>
                <dd className="mt-1 text-sm font-medium tabular-nums">
                  {o.status === "trialing" ? (
                    <LocalTime date={o.trialEndsAt} format="date" />
                  ) : o.hasLiveSubscription || o.status === "canceled" ? (
                    <LocalTime date={o.currentPeriodEndsAt} format="date" />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">Billing</dt>
                <dd className="mt-1 text-sm font-medium">
                  {price} per {o.price.interval}
                </dd>
              </div>
            </dl>
          )}

          {!freePlan && o.status === "trialing" && !o.hasLiveSubscription && trialLeft !== null && trialLeft > 0 && (
            <p className="text-[13px] text-pretty text-muted-foreground">
              {trialLeft >= 3
                ? `You're on a free trial with full access. Subscribe any time — the remaining ${trialLeft} days of your trial carry over and you're only charged when it ends.`
                : "Your free trial ends soon. Subscribe now to keep full access without interruption."}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="What's included" description="One flat price per workspace. Add as many teammates and inboxes as you need.">
        <IncludedList />
      </SettingsSection>
    </div>
  )
}
