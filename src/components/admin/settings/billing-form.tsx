"use client"

import { useState } from "react"
import Link from "next/link"
import { Info, RefreshCw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel, StatusBadge, formatMoney } from "@/components/admin/ui"
import { CopyField, useAdminAction } from "@/components/admin/client"
import { SecretInput } from "@/components/admin/secret-input"
import {
  Callout,
  NumberInput,
  GRID_FIELD,
  SettingField,
  SettingsFormShell,
  SwitchField,
  useSettingsForm,
} from "@/components/admin/settings/form"
import { createStripePriceAction } from "@/app/admin/settings/billing-actions"

export type BillingSettingsValue = {
  enabled: boolean
  stripeSecretKeyEnc: string
  stripePublishableKey: string
  stripeWebhookSecretEnc: string
  productId: string
  priceId: string
  amount: number
  currency: string
  interval: "month" | "year"
  trialDays: number
  enforce: boolean
}

const CURRENCIES = ["usd", "eur", "gbp", "chf", "cad", "aud", "sek", "nok", "dkk", "pln", "jpy", "inr", "brl"]

export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]

function MoneyInput({
  id,
  cents,
  currency,
  onChange,
  invalid,
}: {
  id: string
  cents: number
  currency: string
  onChange: (cents: number) => void
  invalid?: boolean
}) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2))
  return (
    <div className="relative w-full sm:w-44">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid}
        className="pr-14 tabular-nums"
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".")
          setText(next)
          const n = Number.parseFloat(next)
          if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100))
        }}
        onBlur={() => setText((cents / 100).toFixed(2))}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[12px] uppercase text-muted-foreground">
        {currency || "usd"}
      </span>
    </div>
  )
}

export function BillingSettingsForm({
  initial,
  mode,
  webhookUrl,
}: {
  initial: BillingSettingsValue
  mode: "private" | "saas"
  webhookUrl: string
}) {
  const form = useSettingsForm("billing", initial)
  const v = form.values
  const { pending, run } = useAdminAction()
  const hasSecretKey = Boolean(form.secretPreview("stripeSecretKeyEnc"))
  const testMode = form.secretPreview("stripeSecretKeyEnc").startsWith("sk_test")

  return (
    <SettingsFormShell form={form}>
      {mode !== "saas" && (
        <Callout tone="neutral" icon={Info}>
          Billing only applies when the instance runs in <strong>Public SaaS</strong> mode. This instance is private, so workspaces are
          never charged. Change the mode in{" "}
          <Link href="/admin/settings/general" className="font-medium text-foreground underline underline-offset-2">
            General settings
          </Link>
          .
        </Callout>
      )}

      <Panel
        title="Subscriptions"
        description="Hosted workspaces start a free trial and then subscribe via Stripe Checkout."
        actions={
          v.enabled && mode === "saas" ? (
            <StatusBadge tone="ok">Billing active</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Billing off</StatusBadge>
          )
        }
      >
        <div className="divide-y divide-border">
          <SwitchField
            id="billing-enabled"
            label="Enable billing"
            description="New workspaces get the cloud plan with a trial; owners can subscribe from workspace settings."
            checked={v.enabled}
            onCheckedChange={(enabled) => form.set({ enabled })}
          />
          <SwitchField
            id="billing-enforce"
            label="Read-only when unpaid"
            description="Workspaces without an active subscription (after the trial) become read-only until someone subscribes."
            checked={v.enforce}
            onCheckedChange={(enforce) => form.set({ enforce })}
          />
        </div>
      </Panel>

      <Panel title="Plan" description="One simple plan per workspace. Changing the price creates a new Stripe price; existing subscriptions keep theirs.">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <SettingField label="Price" htmlFor="billing-amount" className={GRID_FIELD} error={form.error("amount")}>
            <MoneyInput
              key={form.formKey}
              id="billing-amount"
              cents={v.amount}
              currency={v.currency}
              onChange={(amount) => form.set({ amount })}
              invalid={Boolean(form.error("amount"))}
            />
          </SettingField>
          <SettingField label="Currency" htmlFor="billing-currency" className={GRID_FIELD} error={form.error("currency")}>
            <Select value={v.currency} onValueChange={(currency) => form.set({ currency })}>
              <SelectTrigger id="billing-currency" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(CURRENCIES.includes(v.currency) ? CURRENCIES : [v.currency, ...CURRENCIES]).map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="font-mono uppercase">{c}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingField>
          <SettingField label="Billing interval" htmlFor="billing-interval" className={GRID_FIELD}>
            <Select value={v.interval} onValueChange={(interval) => form.set({ interval: interval as "month" | "year" })}>
              <SelectTrigger id="billing-interval" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </SettingField>
          <SettingField label="Free trial" htmlFor="billing-trial" className={GRID_FIELD} description="0 disables the trial." error={form.error("trialDays")}>
            <NumberInput
              id="billing-trial"
              value={v.trialDays}
              min={0}
              max={365}
              suffix="days"
              onChange={(trialDays) => form.set({ trialDays })}
              aria-invalid={Boolean(form.error("trialDays"))}
            />
          </SettingField>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Customers see:{" "}
          <span className="font-medium text-foreground">
            {v.trialDays > 0 ? `${v.trialDays}-day free trial, then ` : ""}
            {formatMoney(v.amount, v.currency)}/{v.interval} per workspace
          </span>
        </p>
      </Panel>

      <Panel
        title="Stripe API keys"
        description={
          <>
            Find them in the Stripe dashboard under{" "}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Developers → API keys
            </a>
            . Use test keys (sk_test_…) while trying things out.
          </>
        }
        actions={hasSecretKey ? <StatusBadge tone={testMode ? "warn" : "ok"}>{testMode ? "Test mode" : "Live mode"}</StatusBadge> : null}
      >
        <div className="divide-y divide-border">
          <SettingField label="Secret key" htmlFor="stripe-secret">
            <SecretInput
              key={form.formKey}
              id="stripe-secret"
              preview={form.secretPreview("stripeSecretKeyEnc")}
              value={form.secrets.stripeSecretKeyEnc}
              onChange={(val) => form.setSecret("stripeSecretKeyEnc", val)}
              placeholder="sk_live_… or rk_live_…"
            />
          </SettingField>
          <SettingField label="Publishable key" htmlFor="stripe-publishable" error={form.error("stripePublishableKey")}>
            <Input
              id="stripe-publishable"
              value={v.stripePublishableKey}
              placeholder="pk_live_…"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[13px]"
              onChange={(e) => form.set({ stripePublishableKey: e.target.value })}
              aria-invalid={Boolean(form.error("stripePublishableKey"))}
            />
          </SettingField>
        </div>
      </Panel>

      <Panel title="Webhook" description="Stripe notifies Dispatch about checkouts, renewals and failed payments through this endpoint.">
        <div className="divide-y divide-border">
          <SettingField label="Endpoint URL" description="Add it under Developers → Webhooks → Add endpoint.">
            <CopyField value={webhookUrl} />
          </SettingField>
          <SettingField label="Events to send">
            <div className="flex flex-wrap gap-1.5">
              {STRIPE_WEBHOOK_EVENTS.map((e) => (
                <code key={e} className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px]">
                  {e}
                </code>
              ))}
            </div>
          </SettingField>
          <SettingField label="Signing secret" htmlFor="stripe-webhook-secret" description="Shown after creating the endpoint (whsec_…).">
            <SecretInput
              key={form.formKey}
              id="stripe-webhook-secret"
              preview={form.secretPreview("stripeWebhookSecretEnc")}
              value={form.secrets.stripeWebhookSecretEnc}
              onChange={(val) => form.setSecret("stripeWebhookSecretEnc", val)}
              placeholder="whsec_…"
            />
          </SettingField>
        </div>
      </Panel>

      <Panel
        title="Stripe product & price"
        description="Dispatch creates one product and a recurring price in your Stripe account from the plan above."
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted-foreground">Product ID</span>
              {form.baseline.productId ? (
                <CopyField value={form.baseline.productId} />
              ) : (
                <span className="text-sm text-muted-foreground">Not created yet</span>
              )}
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted-foreground">Price ID</span>
              {form.baseline.priceId ? (
                <CopyField value={form.baseline.priceId} />
              ) : (
                <span className="text-sm text-muted-foreground">Not created yet</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending || form.dirty || !hasSecretKey}
              onClick={() =>
                run(() => createStripePriceAction({}), {
                  success: (d) => `Stripe price ${d.priceId} is ready`,
                })
              }
            >
              {pending ? <Spinner /> : <RefreshCw />}
              {form.baseline.priceId ? "Refresh product & price" : "Create product & price"}
            </Button>
            <span className="text-[13px] text-muted-foreground">
              {!hasSecretKey
                ? "Save a Stripe secret key first."
                : form.dirty
                  ? "Save your changes first."
                  : "Run it again after changing the price, currency or interval."}
            </span>
          </div>
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
