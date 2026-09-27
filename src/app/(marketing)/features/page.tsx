import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { BentoCard } from "@/components/marketing/bento"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { APP_ENTRY } from "@/content/marketing/site"
import { ButtonLink, MonoLabel, PixelMark, Section } from "@/components/marketing/primitives"
import { featureCategories, featureItems, getFeaturesByCategory } from "@/content/marketing/features"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Features",
  description:
    "Every Dispatch feature: shared inboxes, internal comments, assignments, rules, canned responses, team chat, tasks, analytics, an AI assistant, and a REST API.",
  alternates: { canonical: "/features" },
}

export default async function FeaturesPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        align="center"
        eyebrow={<MonoLabel>Features</MonoLabel>}
        title="Everything your team needs"
        quiet="to share an inbox."
        description="Dispatch adds collaboration, workflow and automation to the mailboxes you already use. Every feature is included on every plan."
        actions={
          <>
            <ButtonLink href={APP_ENTRY} size="lg" arrow>
              Start free trial
            </ButtonLink>
            <ButtonLink href="/pricing" size="lg" variant="secondary">
              See pricing
            </ButtonLink>
          </>
        }
      >
        <nav aria-label="Feature categories" className="relative -mx-5 border-t border-border sm:-mx-8 lg:-mx-12">
          <ul className="scrollbar-none flex gap-1 overflow-x-auto px-5 py-3 sm:justify-center sm:px-8 lg:px-12">
            {featureCategories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <a
                  href={`#${c.slug}`}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-card/60 px-3.5 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      {featureCategories.map((cat, idx) => {
        const items = featureItems[cat.slug]
        const highlights = getFeaturesByCategory(cat.slug).slice(0, 2)
        return (
          <Section key={cat.slug} id={cat.slug} padding="md" className="scroll-mt-16" aria-labelledby={`${cat.slug}-title`}>
            <div className="grid gap-10 lg:grid-cols-[280px_1fr] lg:gap-14">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <PixelMark /> {String(idx + 1).padStart(2, "0")}
                </span>
                <h2 id={`${cat.slug}-title`} className="mt-4 text-[28px] leading-tight font-semibold tracking-display sm:text-[32px]">
                  {cat.name}
                </h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{cat.description}</p>
              </div>
              <div>
                {highlights.length > 0 && (
                  <div className={cn("mb-3 grid gap-3", highlights.length > 1 && "md:grid-cols-2")}>
                    {highlights.map((f) => (
                      <BentoCard
                        key={f.slug}
                        title={`${f.name}.`}
                        quiet={f.tagline}
                        visual={f.visual}
                        href={`/features/${f.slug}`}
                      />
                    ))}
                  </div>
                )}
                <ul className="grid overflow-hidden rounded-[6px] border border-border bg-card sm:grid-cols-2">
                  {items.map((item) => {
                    const Icon = item.icon
                    const body = (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface text-foreground/80">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-tight">
                            {item.name}
                            {item.slug && (
                              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
                            )}
                          </span>
                          <span className="mt-1 block text-[13.5px] leading-relaxed text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </>
                    )
                    return (
                      <li
                        key={item.name}
                        className="-mb-px border-b border-border sm:[&:nth-child(odd)]:border-r"
                      >
                        {item.slug ? (
                          <Link href={`/features/${item.slug}`} className="group flex h-full gap-3.5 p-5 transition-colors hover:bg-surface/60">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex h-full gap-3.5 p-5">{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          </Section>
        )
      })}

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
