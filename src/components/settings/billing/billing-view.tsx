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
import { localizeDictionaryText, useI18n } from "@/lib/i18n"


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
  const { t } = useI18n()
  const { status } = overview
  if (status === "trialing") {
    const left = daysUntil(overview.trialEndsAt, now)
    if (left !== null && left <= 0) return <StatusBadge tone="danger">{t("billTrialEnded")}</StatusBadge>
    return (
      <StatusBadge tone="info">
        {left !== null ? t("billTrialWithDays").replace("{days}", String(left)) : t("billTrial")}
      </StatusBadge>
    )
  }
  if (status === "active") return <StatusBadge tone="success">{t("billActiveStatus")}</StatusBadge>
  if (status === "past_due") return <StatusBadge tone="warning">{t("billPastDue")}</StatusBadge>
  if (status === "canceled") return <StatusBadge tone="neutral">{t("billCanceled")}</StatusBadge>
  if (status === "unpaid") return <StatusBadge tone="danger">{t("billUnpaid")}</StatusBadge>
  if (status === "incomplete") return <StatusBadge tone="warning">{t("billIncomplete")}</StatusBadge>
  return <StatusBadge tone="neutral">{t("billNoSubscription")}</StatusBadge>
}

function IncludedList({ className }: { className?: string }) {
  const { t } = useI18n()
  const included = ["billUnlimitedTeammates", "billUnlimitedInboxes", "billCommentsAssignments", "billRulesResponses", "billChatTasks", "billAnalyticsAudit", "billApiWebhooks", "billRolesPermissions"] as const
  return (
    <ul className={cn("grid gap-x-6 gap-y-2.5 sm:grid-cols-2", className)}>
      {included.map((key) => (
        <li key={key} className="flex items-start gap-2.5 text-[13px]">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="text-pretty">{t(key)}</span>
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
  const { locale } = useI18n()
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
        {localizeDictionaryText(children, locale)}
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
  const { locale } = useI18n()
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
        <p className="font-medium">{localizeDictionaryText(title, locale)}</p>
        {children && <div className="mt-0.5 text-pretty text-muted-foreground">{localizeDictionaryText(children, locale)}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon-xs" onClick={onDismiss} aria-label={locale === "it" ? "Chiudi" : "Dismiss"}>
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
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [dismissedError, setDismissedError] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (!checkout || handled.current) return
    handled.current = true
    if (checkout === "canceled") {
      toast(t("billCheckoutCanceled"))
      router.replace(pathname, { scroll: false })
      return
    }
    toast.success(t("billCheckoutSuccess"))
    void syncBillingStatus({ slug }).finally(() => {
      router.replace(pathname, { scroll: false })
      router.refresh()
    })
  }, [checkout, pathname, router, slug, t])

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
              <MicroLabel>{t("billCurrentPlan")}</MicroLabel>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {t("billSelfHosted")} <span className="text-quiet">{t("billFreeForever")}</span>
              </h2>
              <p className="mt-1.5 max-w-lg text-[13px] text-pretty text-muted-foreground">
                {t("billSelfHostedInstance").replace("{product}", productName)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border bg-surface/50 p-4">
            <MicroLabel className="mb-3 block">{t("billEverythingIncluded")}</MicroLabel>
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
          <Notice tone="danger" icon={AlertTriangle} title={t("billError")} onDismiss={dismissError}>
          {error}
        </Notice>
      )}
      {!o.configured && !freePlan && (
        <Notice tone="info" icon={Sparkles} title={t("billNotSetUp")}>
          {t("billAdminStripe")}
        </Notice>
      )}
      {o.locked && o.locked.reason === "billing" && (
        <Notice tone="danger" icon={Lock} title={t("billReadOnly")}>
          {o.locked.message} {t("billRestoreAccess")}
        </Notice>
      )}
      {o.status === "past_due" && (
        <Notice tone="warning" icon={AlertTriangle} title={t("billPaymentFailed")}>
          {t("billPaymentFailedDescription")}
        </Notice>
      )}

      <SettingsSection
        footer={
          freePlan ? undefined : (
            <>
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> {t("billStripePayments")}
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {canManage && (
                  <StripeButton slug={slug} kind="portal" variant={canSubscribe ? "outline" : "default"} disabled={!o.configured}>
                    {t("billManage")}
                  </StripeButton>
                )}
                {canSubscribe && (
                  <StripeButton slug={slug} kind="checkout" disabled={!o.configured}>
                    {o.status === "canceled" ? t("billResubscribe") : t("billSubscribe")}
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
            <MicroLabel>{t("billCurrentPlan")}</MicroLabel>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {freePlan ? (
                  <>
                    {o.plan === "comped" ? t("billComplimentary") : t("billFree")} <span className="text-quiet">{t("billPlan")}</span>
                  </>
                ) : (
                  <>
                    {productName} <span className="text-quiet">Cloud</span>
                  </>
                )}
              </h2>
              {freePlan ? (
                <p className="mt-1.5 max-w-lg text-[13px] text-pretty text-muted-foreground">
                  {o.plan === "comped" ? t("billCompedDescription") : t("billFreeDescription")}
                </p>
              ) : (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">{price}</span>
                  <span className="text-sm text-muted-foreground">/ {o.price.interval} · {t("billUnlimitedUsers")}</span>
                </p>
              )}
            </div>
            {!freePlan && <StatusPill overview={o} now={now} />}
            {freePlan && <StatusBadge tone="success">{t("billActiveStatus")}</StatusBadge>}
          </div>

          {!freePlan && (
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{t("billStatus")}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {o.status === "trialing"
                    ? t("billTrialStatus")
                    : o.status === "none"
                      ? t("billNotSubscribed")
                      : o.status === "past_due"
                        ? t("billPaymentOverdue")
                        : o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                </dd>
              </div>
              <div className="bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">
                  {o.status === "trialing" ? t("billTrialEnds") : o.status === "canceled" ? t("billAccessEnded") : t("billRenewsOn")}
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
                <dt className="text-xs text-muted-foreground">{t("billBilling")}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {price} per {o.price.interval}
                </dd>
              </div>
            </dl>
          )}

          {!freePlan && o.status === "trialing" && !o.hasLiveSubscription && trialLeft !== null && trialLeft > 0 && (
            <p className="text-[13px] text-pretty text-muted-foreground">
              {trialLeft >= 3
                ? t("billTrialFullAccess").replace("{days}", String(trialLeft))
                : t("billTrialEndsSoon")}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={t("billIncluded")} description={t("billDescription")}>
        <IncludedList />
      </SettingsSection>
    </div>
  )
}
