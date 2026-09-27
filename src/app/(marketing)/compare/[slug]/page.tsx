import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Check, Minus } from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { FaqSection } from "@/components/marketing/faq"
import { fillPrice, getCloudPricing, type CloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { monthlyCloud, referencePrice } from "@/components/marketing/pricing-parts"
import { ButtonLink, MonoLabel, PixelMark, Section, SectionHeading } from "@/components/marketing/primitives"
import { competitors, getCompetitor, PRICES_AS_OF } from "@/content/marketing/competitors"
import { APP_ENTRY } from "@/content/marketing/site"
import type { ComparisonValue, Competitor } from "@/content/marketing/types"

export function generateStaticParams() {
  return competitors.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const c = getCompetitor(slug)
  if (!c) return {}
  return {
    title: `Dispatch vs ${c.name}: an open-source ${c.name} alternative`,
    description: c.metaDescription,
    alternates: { canonical: `/compare/${c.slug}` },
  }
}

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)

export default async function CompetitorPage({ params }: PageProps<"/compare/[slug]">) {
  const { slug } = await params
  const c = getCompetitor(slug)
  if (!c) notFound()
  const pricing = await getCloudPricing()
  const fill = (s: string) => fillPrice(s, pricing)

  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Compare", href: "/compare" }, { label: `Dispatch vs ${c.name}` }]}
        eyebrow={<MonoLabel>Dispatch vs {c.name}</MonoLabel>}
        title={c.headline[0]}
        quiet={c.headline[1]}
        description={fill(c.description)}
        actions={
          <>
            <ButtonLink href={APP_ENTRY} size="lg" arrow>
              Start free trial
            </ButtonLink>
            <ButtonLink href="/self-hosting" size="lg" variant="secondary">
              Self-host for free
            </ButtonLink>
          </>
        }
        aside={<PriceCard competitor={c} pricing={pricing} />}
      />

      <Section padding="lg" aria-labelledby="glance-title">
        <SectionHeading id="glance-title" eyebrow={<MonoLabel>At a glance</MonoLabel>} title={`Dispatch and ${c.name}`} quiet="compared." />
        <div className="mt-10 -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full border-collapse text-left text-[13.5px] sm:text-[14px]">
            <caption className="sr-only">
              Dispatch compared with {c.name}
            </caption>
            <thead>
              <tr>
                <td className="w-[38%] border-b border-border pb-4" />
                <th scope="col" className="border-b border-border bg-brand-soft/60 px-2.5 pt-4 pb-4 sm:px-4 text-[15px] font-semibold">
                  Dispatch
                </th>
                <th scope="col" className="border-b border-border px-2.5 pt-4 pb-4 sm:px-4 text-[15px] font-semibold">
                  {c.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {c.table.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="border-b border-border py-3.5 pr-2.5 font-normal sm:pr-4 text-foreground/85">
                    {row.label}
                  </th>
                  <td className="border-b border-border bg-brand-soft/60 px-2.5 py-3.5 sm:px-4 font-medium">
                    <Value v={row.dispatch} fill={fill} />
                  </td>
                  <td className="border-b border-border px-2.5 py-3.5 text-foreground/80 sm:px-4">
                    <Value v={row.them} fill={fill} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
          {c.name} details are based on its public website and pricing page as of {PRICES_AS_OF}. Pricing:{" "}
          {c.pricingBasis}.
        </p>
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="switch-title">
        <SectionHeading
          id="switch-title"
          eyebrow={<MonoLabel>Why teams switch</MonoLabel>}
          title={`Why teams move from ${c.name}`}
          quiet="to Dispatch."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {c.whySwitch.map((w, i) => (
            <div key={w.title} className="rounded-[6px] border border-border bg-card p-6 sm:p-7">
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{w.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{fill(w.body)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section padding="lg" aria-labelledby="fit-title">
        <SectionHeading
          id="fit-title"
          eyebrow={<MonoLabel>An honest take</MonoLabel>}
          title="Which one fits"
          quiet="your team?"
        />
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          <div className="rounded-[6px] border border-border bg-card p-6 sm:p-7">
            <h3 className="text-[16px] font-semibold tracking-tight">{c.name} is a good fit if you want</h3>
            <ul className="mt-4 space-y-2.5">
              {c.strengths.map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-[14.5px] text-foreground/85">
                  <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="mk-dark rounded-[6px] border border-border p-6 sm:p-7">
            <h3 className="text-[16px] font-semibold tracking-tight">Dispatch is a good fit if you want</h3>
            <ul className="mt-4 space-y-2.5">
              {[
                "One flat price with unlimited users, or free on your own server",
                "Open source code you can audit and extend (AGPL-3.0)",
                "Your email and credentials on infrastructure you control",
                "Shared inboxes, comments, assignments and rules on Gmail, Outlook or IMAP",
              ].map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-[14.5px]">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section padding="lg" aria-labelledby="migrate-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading
            id="migrate-title"
            eyebrow={<MonoLabel>Switching</MonoLabel>}
            title={`Moving from ${c.name}`}
            quiet="in an afternoon."
            description="Your email lives in your mailboxes, not in a vendor's database, so switching mostly means connecting them to Dispatch."
          />
          <ol className="space-y-2">
            {c.migration.map((m, i) => (
              <li key={m} className="flex items-start gap-4 rounded-[6px] border border-border bg-card p-4 sm:p-5">
                <span className="inline-flex items-center gap-2 pt-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                  <PixelMark /> {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[14.5px] leading-relaxed">{m}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section padding="lg">
        <FaqSection
          title={`Dispatch vs ${c.name}:`}
          quiet="common questions."
          items={[
            {
              q: `Can we try Dispatch alongside ${c.name}?`,
              a: `Yes. Dispatch connects to the same underlying mailboxes, so a few teammates can try it while everyone else keeps using ${c.name}.`,
            },
            {
              q: "Will we lose our email history?",
              a: `No. Your messages live in your mailbox and Dispatch syncs them from there. Data that exists only inside ${c.name}, such as its internal comments or assignments, doesn't carry over automatically.`,
            },
            {
              q: "How much does Dispatch cost?",
              a: `Self-hosting is free, with every feature and unlimited users. Dispatch Cloud is ${pricing.perInterval} per workspace with unlimited users and a ${pricing.trialDays}-day free trial.`,
            },
          ]}
        />
      </Section>

      <CtaSection trialDays={pricing.trialDays} title={`Try Dispatch instead of ${c.name}.`} quiet="Keep your mailboxes." />
    </>
  )
}

function Value({ v, fill }: { v: ComparisonValue; fill: (s: string) => string }) {
  if (v === true)
    return (
      <span className="inline-flex items-center gap-1.5 text-(--brand-ink)">
        <Check className="size-4" strokeWidth={2.5} aria-hidden />
        <span className="sr-only">Yes</span>
      </span>
    )
  if (v === false)
    return (
      <span className="inline-flex items-center text-muted-foreground">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">No</span>
      </span>
    )
  return <>{fill(v)}</>
}

function PriceCard({ competitor: c, pricing }: { competitor: Competitor; pricing: CloudPricing }) {
  const team = 10
  const theirs = referencePrice(c) * team
  const ours = monthlyCloud(pricing)
  return (
    <div className="mk-glow">
      <div className="rounded-[10px] border border-border bg-card p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.25)] sm:p-8">
        <MonoLabel>A team of {team}, per month</MonoLabel>
        <div className="mt-6 space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[14px] font-medium">
                {c.name} <span className="text-muted-foreground">{c.referencePlan}</span>
              </span>
              <span className="text-[22px] font-semibold tracking-tight tabular-nums">{usd(theirs)}</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-foreground/70" />
            <div className="mt-1.5 text-[12px] text-muted-foreground">
              {usd(referencePrice(c))} per user × {team}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[14px] font-medium">Dispatch Cloud</span>
              <span className="text-[22px] font-semibold tracking-tight tabular-nums">{pricing.format(ours)}</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, Math.max(3, (ours / Math.max(theirs, 1)) * 100))}%` }}
              />
            </div>
            <div className="mt-1.5 text-[12px] text-muted-foreground">Flat per workspace, unlimited users</div>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-5">
            <span className="text-[14px] font-medium">Dispatch self-hosted</span>
            <span className="text-[22px] font-semibold tracking-tight tabular-nums">{pricing.format(0)}</span>
          </div>
        </div>
        <p className="mt-6 text-[11.5px] leading-relaxed text-muted-foreground">
          {c.name} list price as published in {PRICES_AS_OF}, billed annually. {c.trial}.
        </p>
      </div>
    </div>
  )
}
