import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, MonoLabel, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { VisualStage } from "@/components/marketing/visuals"
import { getFeature } from "@/content/marketing/features"
import { APP_ENTRY } from "@/content/marketing/site"
import { getUseCase, useCases } from "@/content/marketing/use-cases"
import { cn } from "@/lib/utils"

export function generateStaticParams() {
  return useCases.map((u) => ({ slug: u.slug }))
}

export async function generateMetadata({ params }: PageProps<"/use-cases/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const u = getUseCase(slug)
  if (!u) return {}
  return {
    title: `Dispatch for ${u.name.toLowerCase()} teams`,
    description: u.metaDescription,
    alternates: { canonical: `/use-cases/${u.slug}` },
  }
}

export default async function UseCasePage({ params }: PageProps<"/use-cases/[slug]">) {
  const { slug } = await params
  const useCase = getUseCase(slug)
  if (!useCase) notFound()
  const pricing = await getCloudPricing()
  const features = useCase.features.map((s) => getFeature(s)).filter((f) => f !== undefined)
  const Icon = useCase.icon
  const others = useCases.filter((u) => u.slug !== useCase.slug).slice(0, 4)

  return (
    <>
      <PageHero
        breadcrumbs={[{ label: "Solutions", href: "/use-cases" }, { label: useCase.name }]}
        eyebrow={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-3 pl-1.5 text-[12.5px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-(--brand-ink)">
              <Icon className="size-3" aria-hidden />
            </span>
            For {useCase.name.toLowerCase()} teams
          </span>
        }
        title={useCase.headline[0]}
        quiet={useCase.headline[1]}
        description={useCase.description}
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
        aside={<VisualStage kind={useCase.workflow[0]?.visual ?? "inbox"} size="lg" className="mk-glow bg-background" />}
      />

      <Section padding="lg" aria-labelledby="pains-title">
        <SectionHeading id="pains-title" eyebrow={<MonoLabel>Sound familiar?</MonoLabel>} title="Where a normal inbox" quiet="gets in the way." />
        <div className="mt-10 grid overflow-hidden rounded-[6px] border border-border md:grid-cols-3">
          {useCase.pains.map((p, i) => (
            <div key={p.title} className="border-b border-border p-6 last:border-b-0 md:border-b-0 md:[&:not(:last-child)]:border-r">
              <div className="font-mono text-[11px] text-muted-foreground">0{i + 1}</div>
              <h3 className="mt-6 text-[16px] font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {useCase.workflow.map((w, i) => (
        <Section key={w.title} padding="md" aria-labelledby={`step-${i}`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn(i % 2 === 1 && "lg:order-last")}>
              <StepLabel step={i + 1} label={w.label} />
              <h2 id={`step-${i}`} className="mt-5 text-[28px] leading-[1.08] font-semibold tracking-display text-balance sm:text-[36px]">
                {w.title}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{w.body}</p>
            </div>
            <VisualStage kind={w.visual} />
          </div>
        </Section>
      ))}

      <Section padding="lg" tone="surface" aria-labelledby="setup-title">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="setup-title"
              eyebrow={<MonoLabel>Your first hour</MonoLabel>}
              title="A setup that works"
              quiet="from day one."
              description={`A starting point for ${useCase.name.toLowerCase()} teams. Every step happens in the browser, no consultants required.`}
            />
            <ol className="mt-8 space-y-2">
              {useCase.setup.map((s, i) => (
                <li key={s} className="flex items-start gap-3 rounded-[6px] border border-border bg-card px-4 py-3 text-[14.5px]">
                  <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[10.5px] text-(--brand-ink)">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <MonoLabel>Features you&apos;ll use most</MonoLabel>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {features.map((f) => {
                const FIcon = f.icon
                return (
                  <li key={f.slug}>
                    <Link
                      href={`/features/${f.slug}`}
                      className="group flex h-full gap-3 rounded-[6px] border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface">
                        <FIcon className="size-4" aria-hidden />
                      </span>
                      <span>
                        <span className="flex items-center gap-1 text-[14px] font-semibold tracking-tight">
                          {f.name}
                          <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                        <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{f.tagline}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </Section>

      <Section padding="md" aria-labelledby="more-title">
        <h2 id="more-title" className="text-[20px] font-semibold tracking-tight">
          More teams on Dispatch
        </h2>
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((o) => {
            const OIcon = o.icon
            return (
              <li key={o.slug}>
                <Link
                  href={`/use-cases/${o.slug}`}
                  className="group flex items-center gap-3 rounded-[6px] border border-border bg-card px-4 py-3.5 text-[14px] font-medium transition-colors hover:border-foreground/20"
                >
                  <OIcon className="size-4 text-muted-foreground" aria-hidden />
                  {o.name}
                  <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
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
