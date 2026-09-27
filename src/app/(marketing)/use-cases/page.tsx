import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { MonoLabel, Section } from "@/components/marketing/primitives"
import { FeatureVisual } from "@/components/marketing/visuals"
import { useCases } from "@/content/marketing/use-cases"

export const metadata: Metadata = {
  title: "Use cases",
  description:
    "How support, sales, agencies, operations, accounting, legal, e-commerce and real-estate teams run their shared email in Dispatch.",
  alternates: { canonical: "/use-cases" },
}

export default async function UseCasesPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        align="center"
        eyebrow={<MonoLabel>Solutions</MonoLabel>}
        title="Built for every team"
        quiet="that shares an inbox."
        description="Wherever several people answer the same address, Dispatch gives each email an owner and each question a place to be discussed."
      />
      <Section padding="md">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((u) => {
            const Icon = u.icon
            return (
              <li key={u.slug}>
                <Link
                  href={`/use-cases/${u.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-[6px] border border-border bg-surface transition-colors hover:border-foreground/20"
                >
                  <div className="relative flex h-[210px] items-center justify-center overflow-hidden border-b border-border bg-background px-4">
                    <div aria-hidden className="mk-dots absolute inset-0 opacity-60 mk-fade-bottom" />
                    <FeatureVisual kind={u.workflow[0]?.visual ?? "inbox"} className="relative origin-center scale-[0.82]" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                      <Icon className="size-4 text-muted-foreground" aria-hidden /> {u.name}
                    </span>
                    <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">{u.tagline}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium">
                      Learn more
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </Section>
      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
