import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { PerSeatComparison, referencePrice } from "@/components/marketing/pricing-parts"
import { MonoLabel, Section, SectionHeading } from "@/components/marketing/primitives"
import { competitors } from "@/content/marketing/competitors"

export const metadata: Metadata = {
  title: "Compare Dispatch",
  description:
    "How Dispatch compares with Missive, Front, Hiver, Help Scout and Gmelius: pricing model, open source, self-hosting and core collaborative inbox features.",
  alternates: { canonical: "/compare" },
}

export default async function ComparePage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        align="center"
        eyebrow={<MonoLabel>Compare</MonoLabel>}
        title="Dispatch and the alternatives,"
        quiet="side by side."
        description="Every tool here does shared email well. Dispatch is the one that's open source, free to self-host and priced per workspace instead of per person."
      />
      <Section padding="md">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="group flex h-full flex-col rounded-[6px] border border-border bg-card p-6 transition-colors hover:border-foreground/20"
              >
                <MonoLabel>Dispatch vs</MonoLabel>
                <span className="mt-2 text-[24px] font-semibold tracking-display">{c.name}</span>
                <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted-foreground">{c.positioning}</p>
                <div className="mt-6 flex items-end justify-between gap-4 border-t border-border pt-4">
                  <span className="text-[12.5px] text-muted-foreground">
                    {c.referencePlan} from{" "}
                    <span className="font-semibold text-foreground">${referencePrice(c)}</span> / user / month
                  </span>
                  <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
          <li className="flex flex-col justify-center rounded-[6px] border border-dashed border-border p-6">
            <span className="text-[15px] font-semibold tracking-tight">
              Dispatch <span className="text-muted-foreground">{pricing.perInterval} per workspace, or free to self-host.</span>
            </span>
            <Link href="/pricing" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium underline-offset-4 hover:underline">
              See pricing <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </li>
        </ul>
      </Section>
      <Section padding="lg" aria-labelledby="cost-title">
        <SectionHeading
          id="cost-title"
          eyebrow={<MonoLabel>Monthly cost by team size</MonoLabel>}
          title="The per-seat difference,"
          quiet="in numbers."
        />
        <div className="mt-10">
          <PerSeatComparison pricing={pricing} slugs={["missive", "front", "hiver", "help-scout", "gmelius"]} />
        </div>
      </Section>
      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
