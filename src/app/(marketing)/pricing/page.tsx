import type { Metadata } from "next"
import { CostCalculator } from "@/components/marketing/cost-calculator"
import { CtaSection } from "@/components/marketing/cta-section"
import { FaqSection } from "@/components/marketing/faq"
import { clientPricing, getCloudPricing, type CloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { Bool, PlanCards } from "@/components/marketing/pricing-parts"
import { JsonLd, MonoLabel, PixelMark, Section, SectionHeading } from "@/components/marketing/primitives"
import { competitors, PRICES_AS_OF } from "@/content/marketing/competitors"
import type { Faq } from "@/content/marketing/types"

export async function generateMetadata(): Promise<Metadata> {
  const p = await getCloudPricing()
  return {
    title: "Pricing",
    description: `Dispatch is free to self-host with every feature and unlimited users. Dispatch Cloud is ${p.perInterval} per workspace, with a ${p.trialDays}-day free trial.`,
    alternates: { canonical: "/pricing" },
  }
}

export default async function PricingPage() {
  const pricing = await getCloudPricing()
  const rivals = ["missive", "front", "hiver", "help-scout"]
    .map((s) => competitors.find((c) => c.slug === s))
    .filter((c) => c !== undefined)
    .map((c) => ({ name: c.name, plans: c.plans, referencePlan: c.referencePlan }))

  return (
    <>
      <PageHero
        align="center"
        eyebrow={<MonoLabel>Pricing</MonoLabel>}
        title="One product."
        quiet="Two ways to run it."
        description="Every feature and unlimited users on both plans. Host it yourself for free, or let us run it for one flat price per workspace."
      />
      <Section padding="md" className="border-t-0">
        <PlanCards pricing={pricing} />
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Prices in {pricing.currency}, billed per {pricing.interval}. Taxes may apply depending on your location.
        </p>
      </Section>

      <Section padding="lg" aria-labelledby="included-title">
        <SectionHeading
          id="included-title"
          eyebrow={<MonoLabel>Compare plans</MonoLabel>}
          title="Same software."
          quiet="The difference is who runs it."
        />
        <PlanTable pricing={pricing} />
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="calc-title">
        <SectionHeading
          id="calc-title"
          eyebrow={<MonoLabel>Cost calculator</MonoLabel>}
          title="What would your team pay?"
          quiet="Slide to find out."
          description="Per-seat tools get more expensive with every hire. Dispatch doesn't."
        />
        <div className="mt-10">
          <CostCalculator pricing={clientPricing(pricing)} rivals={rivals} />
        </div>
        <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
          Competitor prices as listed publicly in {PRICES_AS_OF} on each vendor&apos;s pricing page: the plan shown, per
          user per month, billed annually, in USD. Vendors may offer other plans, limits and discounts.
        </p>
      </Section>

      <Section padding="lg">
        <FaqSection items={pricingFaq(pricing)} title="Pricing questions," quiet="answered." />
      </Section>

      <CtaSection trialDays={pricing.trialDays} />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Dispatch Cloud",
          description: "Hosted open-source collaborative inbox with unlimited users.",
          offers: {
            "@type": "Offer",
            price: String(pricing.amount),
            priceCurrency: pricing.currency,
          },
        }}
      />
    </>
  )
}

function PlanTable({ pricing }: { pricing: CloudPricing }) {
  const groups: { name: string; rows: { l: string; self: boolean | string; cloud: boolean | string }[] }[] = [
    {
      name: "Collaboration",
      rows: [
        { l: "Shared team inboxes", self: true, cloud: true },
        { l: "Internal comments & @mentions", self: true, cloud: true },
        { l: "Assignments, labels & snooze", self: true, cloud: true },
        { l: "Collaborative drafts & presence", self: true, cloud: true },
        { l: "Team chat & tasks", self: true, cloud: true },
      ],
    },
    {
      name: "Email & automation",
      rows: [
        { l: "Gmail, Outlook & any IMAP/SMTP mailbox", self: true, cloud: true },
        { l: "Send later, undo send, signatures", self: true, cloud: true },
        { l: "Canned responses", self: true, cloud: true },
        { l: "Rules & automation", self: true, cloud: true },
        { l: "Analytics", self: true, cloud: true },
        { l: "AI assistant (your own API key)", self: true, cloud: true },
        { l: "REST API & webhooks", self: true, cloud: true },
      ],
    },
    {
      name: "Admin & security",
      rows: [
        { l: "Users", self: "Unlimited", cloud: "Unlimited" },
        { l: "Workspaces", self: "Unlimited", cloud: "Per workspace" },
        { l: "Roles & custom permissions", self: true, cloud: true },
        { l: "Audit log", self: true, cloud: true },
        { l: "Passwordless magic-link login", self: true, cloud: true },
        { l: "Super-admin panel for the instance", self: true, cloud: false },
      ],
    },
    {
      name: "Hosting & support",
      rows: [
        { l: "Where it runs", self: "Your server", cloud: "Managed by us" },
        { l: "Updates", self: "One command", cloud: "Automatic" },
        { l: "Backups", self: "Your responsibility", cloud: "Daily" },
        { l: "Support", self: "Community on GitHub", cloud: "Email support" },
        { l: "Price", self: "Free", cloud: `${pricing.perInterval} per workspace` },
      ],
    },
  ]
  const cell = (v: boolean | string) => (typeof v === "string" ? <span className="text-[14px]">{v}</span> : <Bool on={v} />)
  return (
    <div className="mt-12 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse text-left text-[13.5px] sm:text-[14px]">
        <caption className="sr-only">Features included in the self-hosted and cloud plans</caption>
        <thead>
          <tr className="bg-background">
            <td className="w-[44%] border-b border-border py-4 sm:w-1/2" />
            <th scope="col" className="border-b border-border px-2 py-4 text-[14.5px] font-semibold sm:px-3">
              Self-hosted
            </th>
            <th scope="col" className="border-b border-border px-2 py-4 text-[14.5px] font-semibold sm:px-3">
              Cloud
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.name}>
            <tr>
              <th scope="colgroup" colSpan={3} className="pt-8 pb-3 text-left">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-foreground">
                  <PixelMark /> {g.name}
                </span>
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.l} className="border-b border-border">
                <th scope="row" className="py-3 pr-3 font-normal text-foreground/85">
                  {r.l}
                </th>
                <td className="px-2 py-3 sm:px-3">{cell(r.self)}</td>
                <td className="px-2 py-3 sm:px-3">{cell(r.cloud)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

function pricingFaq(p: CloudPricing): Faq[] {
  return [
    {
      q: "What counts as a workspace?",
      a: "A workspace is one team or company with its own inboxes, members, settings and billing. Most companies need exactly one. You can invite as many people into it as you like.",
    },
    {
      q: "Is there really no limit on users?",
      a: `Yes. Dispatch Cloud is ${p.perInterval} per workspace whether you have 3 people or 300. Self-hosted instances have no limits beyond your own server.`,
    },
    {
      q: "What happens when the trial ends?",
      a: `Your ${p.trialDays}-day trial includes every feature. To keep working afterwards, subscribe from the workspace's billing settings. If you don't, the workspace switches to read-only, so nothing is lost while you decide.`,
    },
    {
      q: "Is the self-hosted version limited in any way?",
      a: "No. It's the same code, with every feature and no user limits. The Cloud plan adds managed hosting, automatic updates, daily backups and email support.",
    },
    {
      q: "Can we move between Cloud and self-hosted later?",
      a: "Yes. Dispatch is the same software either way, and your email stays in your own mailboxes. Moving means connecting the same mailboxes to the other instance and setting up your team there.",
    },
    {
      q: "How does billing work?",
      a: `Dispatch Cloud is billed through Stripe at ${p.perInterval} per workspace. Invoices, payment methods and cancellation are handled in the billing portal, linked from your workspace settings.`,
    },
    {
      q: "What does the AGPL-3.0 license mean for my company?",
      a: "You can use, modify and self-host Dispatch freely, including commercially. If you modify Dispatch and let others use your modified version over a network, you need to publish those changes under the same license.",
    },
  ]
}
