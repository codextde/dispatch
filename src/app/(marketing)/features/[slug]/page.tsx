import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Check } from "lucide-react"
import { BentoCard } from "@/components/marketing/bento"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, MonoLabel, PixelMark, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { VisualStage } from "@/components/marketing/visuals"
import { featureCategories, features, getFeature } from "@/content/marketing/features"
import { APP_ENTRY } from "@/content/marketing/site"
import { cn } from "@/lib/utils"

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }))
}

export async function generateMetadata({ params }: PageProps<"/features/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const f = getFeature(slug)
  if (!f) return {}
  return {
    title: `${f.name} — ${f.headline[0].replace(/\.$/, "")}`,
    description: f.metaDescription,
    alternates: { canonical: `/features/${f.slug}` },
  }
}

export default async function FeaturePage({ params }: PageProps<"/features/[slug]">) {
  const { slug } = await params
  const feature = getFeature(slug)
  if (!feature) notFound()
  const pricing = await getCloudPricing()
  const category = featureCategories.find((c) => c.slug === feature.category)
  const related = feature.related.map((s) => getFeature(s)).filter((f) => f !== undefined)
  const Icon = feature.icon

  return (
    <>
      <PageHero
        breadcrumbs={[
          { label: "Features", href: "/features" },
          ...(category ? [{ label: category.name, href: `/features#${category.slug}` }] : []),
          { label: feature.name },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-3 pl-1.5 text-[12.5px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-(--brand-ink)">
              <Icon className="size-3" aria-hidden />
            </span>
            {feature.name}
          </span>
        }
        title={feature.headline[0]}
        quiet={feature.headline[1]}
        description={feature.description}
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
        aside={<VisualStage kind={feature.visual} size="lg" className="mk-glow bg-background" />}
      />

      {feature.benefits.map((b, i) => (
        <Section key={b.title} padding="md" aria-labelledby={`benefit-${i}`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn(i % 2 === 1 && "lg:order-last")}>
              <StepLabel label={`${String(i + 1).padStart(2, "0")} · ${feature.name}`} />
              <h2 id={`benefit-${i}`} className="mt-5 text-[28px] leading-[1.08] font-semibold tracking-display text-balance sm:text-[36px]">
                {b.title}
                {b.quiet && <span className="text-quiet"> {b.quiet}</span>}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{b.body}</p>
              {b.points && b.points.length > 0 && (
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {b.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-[14px]">
                      <Check className="mt-0.5 size-4 shrink-0 text-(--brand-ink)" aria-hidden />
                      {pt}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <VisualStage kind={b.visual} />
          </div>
        </Section>
      ))}

      {related.length > 0 && (
        <Section padding="lg" tone="surface" aria-labelledby="related-title">
          <SectionHeading
            id="related-title"
            eyebrow={
              <span className="inline-flex items-center gap-2">
                <PixelMark />
                <MonoLabel>Related features</MonoLabel>
              </span>
            }
            title="Works even better with"
            quiet="the rest of Dispatch."
          />
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {related.map((r) => (
              <BentoCard
                key={r.slug}
                title={`${r.name}.`}
                quiet={r.tagline}
                visual={r.visual}
                href={`/features/${r.slug}`}
                className="bg-background"
              />
            ))}
          </div>
        </Section>
      )}

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
