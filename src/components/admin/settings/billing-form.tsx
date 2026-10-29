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
import { useI18n } from "@/lib/i18n"

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
  const { locale } = useI18n()
  const it = locale === "it"
  const form = useSettingsForm("billing", initial)
  const v = form.values
  const { pending, run } = useAdminAction()
  const hasSecretKey = Boolean(form.secretPreview("stripeSecretKeyEnc"))
  const testMode = form.secretPreview("stripeSecretKeyEnc").startsWith("sk_test")

  return (
    <SettingsFormShell form={form}>
      {mode !== "saas" && (
        <Callout tone="neutral" icon={Info}>
          {it ? "La fatturazione si applica solo in modalità " : "Billing only applies when the instance runs in "}<strong>Public SaaS</strong>{it ? ". Questa istanza è privata, quindi i workspace non vengono mai addebitati. Cambia modalità in " : " mode. This instance is private, so workspaces are never charged. Change the mode in "}{" "}
          <Link href="/admin/settings/general" className="font-medium text-foreground underline underline-offset-2">
            {it ? "Impostazioni generali" : "General settings"}
          </Link>
          .
        </Callout>
      )}

      <Panel
        title={it ? "Abbonamenti" : "Subscriptions"}
        description={it ? "I workspace ospitati iniziano con un periodo di prova gratuito e poi si abbonano tramite Stripe Checkout." : "Hosted workspaces start a free trial and then subscribe via Stripe Checkout."}
        actions={
          v.enabled && mode === "saas" ? (
            <StatusBadge tone="ok">{it ? "Fatturazione attiva" : "Billing active"}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{it ? "Fatturazione disattivata" : "Billing off"}</StatusBadge>
          )
        }
      >
        <div className="divide-y divide-border">
          <SwitchField
            id="billing-enabled"
            label={it ? "Attiva fatturazione" : "Enable billing"}
            description={it ? "I nuovi workspace ricevono il piano cloud con un periodo di prova; i proprietari possono abbonarsi dalle impostazioni del workspace." : "New workspaces get the cloud plan with a trial; owners can subscribe from workspace settings."}
            checked={v.enabled}
            onCheckedChange={(enabled) => form.set({ enabled })}
          />
          <SwitchField
            id="billing-enforce"
            label={it ? "Sola lettura in caso di mancato pagamento" : "Read-only when unpaid"}
            description={it ? "Dopo il periodo di prova, i workspace senza un abbonamento attivo diventano di sola lettura finché qualcuno non si abbona." : "Workspaces without an active subscription (after the trial) become read-only until someone subscribes."}
            checked={v.enforce}
            onCheckedChange={(enforce) => form.set({ enforce })}
          />
        </div>
      </Panel>

      <Panel title={it ? "Piano" : "Plan"} description={it ? "Un unico piano semplice per workspace. Modificare il prezzo ne crea uno nuovo su Stripe; gli abbonamenti esistenti mantengono quello attuale." : "One simple plan per workspace. Changing the price creates a new Stripe price; existing subscriptions keep theirs."}>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <SettingField label={it ? "Prezzo" : "Price"} htmlFor="billing-amount" className={GRID_FIELD} error={form.error("amount")}>
            <MoneyInput
              key={form.formKey}
              id="billing-amount"
              cents={v.amount}
              currency={v.currency}
              onChange={(amount) => form.set({ amount })}
              invalid={Boolean(form.error("amount"))}
            />
          </SettingField>
          <SettingField label={it ? "Valuta" : "Currency"} htmlFor="billing-currency" className={GRID_FIELD} error={form.error("currency")}>
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
          <SettingField label={it ? "Intervallo di fatturazione" : "Billing interval"} htmlFor="billing-interval" className={GRID_FIELD}>
            <Select value={v.interval} onValueChange={(interval) => form.set({ interval: interval as "month" | "year" })}>
              <SelectTrigger id="billing-interval" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">{it ? "Mensile" : "Monthly"}</SelectItem>
                <SelectItem value="year">{it ? "Annuale" : "Yearly"}</SelectItem>
              </SelectContent>
            </Select>
          </SettingField>
          <SettingField label={it ? "Periodo di prova gratuito" : "Free trial"} htmlFor="billing-trial" className={GRID_FIELD} description={it ? "0 disattiva il periodo di prova." : "0 disables the trial."} error={form.error("trialDays")}>
            <NumberInput
              id="billing-trial"
              value={v.trialDays}
              min={0}
              max={365}
              suffix={it ? "giorni" : "days"}
              onChange={(trialDays) => form.set({ trialDays })}
              aria-invalid={Boolean(form.error("trialDays"))}
            />
          </SettingField>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {it ? "I clienti vedranno:" : "Customers see:"}{" "}
          <span className="font-medium text-foreground">
            {v.trialDays > 0 ? (it ? `${v.trialDays} giorni di prova gratuita, poi ` : `${v.trialDays}-day free trial, then `) : ""}
            {formatMoney(v.amount, v.currency)}/{it ? (v.interval === "month" ? "mese" : "anno") : v.interval} {it ? "per workspace" : "per workspace"}
          </span>
        </p>
      </Panel>

      <Panel
        title={it ? "Chiavi API Stripe" : "Stripe API keys"}
        description={
          <>
            {it ? "Le trovi nella dashboard Stripe in " : "Find them in the Stripe dashboard under "}{" "}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              {it ? "Sviluppatori → Chiavi API" : "Developers → API keys"}
            </a>
            {it ? ". Usa chiavi di test (sk_test_…) durante le prove." : ". Use test keys (sk_test_…) while trying things out."}
          </>
        }
        actions={hasSecretKey ? <StatusBadge tone={testMode ? "warn" : "ok"}>{testMode ? (it ? "Modalità test" : "Test mode") : (it ? "Modalità live" : "Live mode")}</StatusBadge> : null}
      >
        <div className="divide-y divide-border">
          <SettingField label={it ? "Chiave segreta" : "Secret key"} htmlFor="stripe-secret">
            <SecretInput
              key={form.formKey}
              id="stripe-secret"
              preview={form.secretPreview("stripeSecretKeyEnc")}
              value={form.secrets.stripeSecretKeyEnc}
              onChange={(val) => form.setSecret("stripeSecretKeyEnc", val)}
              placeholder="sk_live_… or rk_live_…"
            />
          </SettingField>
          <SettingField label={it ? "Chiave pubblicabile" : "Publishable key"} htmlFor="stripe-publishable" error={form.error("stripePublishableKey")}>
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

      <Panel title="Webhook" description={it ? "Stripe invia notifiche a Dispatch su acquisti, rinnovi e pagamenti non riusciti tramite questo endpoint." : "Stripe notifies Dispatch about checkouts, renewals and failed payments through this endpoint."}>
        <div className="divide-y divide-border">
          <SettingField label="URL endpoint" description={it ? "Aggiungilo in Sviluppatori → Webhook → Aggiungi endpoint." : "Add it under Developers → Webhooks → Add endpoint."}>
            <CopyField value={webhookUrl} />
          </SettingField>
          <SettingField label={it ? "Eventi da inviare" : "Events to send"}>
            <div className="flex flex-wrap gap-1.5">
              {STRIPE_WEBHOOK_EVENTS.map((e) => (
                <code key={e} className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px]">
                  {e}
                </code>
              ))}
            </div>
          </SettingField>
          <SettingField label={it ? "Segreto di firma" : "Signing secret"} htmlFor="stripe-webhook-secret" description={it ? "Visibile dopo la creazione dell’endpoint (whsec_…)." : "Shown after creating the endpoint (whsec_…)."}>
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
        title={it ? "Prodotto e prezzo Stripe" : "Stripe product & price"}
        description={it ? "Dispatch crea un prodotto e un prezzo ricorrente nel tuo account Stripe in base al piano qui sopra." : "Dispatch creates one product and a recurring price in your Stripe account from the plan above."}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted-foreground">ID prodotto</span>
              {form.baseline.productId ? (
                <CopyField value={form.baseline.productId} />
              ) : (
                <span className="text-sm text-muted-foreground">{it ? "Non ancora creato" : "Not created yet"}</span>
              )}
            </div>
            <div className="grid gap-1.5">
              <span className="text-[13px] text-muted-foreground">ID prezzo</span>
              {form.baseline.priceId ? (
                <CopyField value={form.baseline.priceId} />
              ) : (
                <span className="text-sm text-muted-foreground">{it ? "Non ancora creato" : "Not created yet"}</span>
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
                  success: (d) => it ? `Prezzo Stripe ${d.priceId} pronto` : `Stripe price ${d.priceId} is ready`,
                })
              }
            >
              {pending ? <Spinner /> : <RefreshCw />}
              {form.baseline.priceId ? (it ? "Aggiorna prodotto e prezzo" : "Refresh product & price") : (it ? "Crea prodotto e prezzo" : "Create product & price")}
            </Button>
            <span className="text-[13px] text-muted-foreground">
              {!hasSecretKey
                ? (it ? "Salva prima una chiave segreta Stripe." : "Save a Stripe secret key first.")
                : form.dirty
                  ? (it ? "Salva prima le modifiche." : "Save your changes first.")
                  : (it ? "Eseguilo di nuovo dopo aver modificato prezzo, valuta o intervallo." : "Run it again after changing the price, currency or interval.")}
            </span>
          </div>
        </div>
      </Panel>
    </SettingsFormShell>
  )
}
