import type { Metadata } from "next"
import { Check } from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ArrowLink, MonoLabel, PixelMark, Section } from "@/components/marketing/primitives"
import { changelog } from "@/content/marketing/changelog"
import { GITHUB_RELEASES_URL } from "@/content/marketing/site"

export const metadata: Metadata = {
  title: "Changelog",
  description: "New features, improvements and fixes in every Dispatch release.",
  alternates: { canonical: "/changelog" },
}

const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })

export default async function ChangelogPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Changelog</MonoLabel>}
        title="What's new"
        quiet="in Dispatch."
        description="Every release, from the first commit onwards. Self-hosted instances update with one command; Dispatch Cloud updates automatically."
        actions={<ArrowLink href={GITHUB_RELEASES_URL} external>Releases on GitHub</ArrowLink>}
      />
      {changelog.map((entry) => (
        <Section key={entry.version} padding="lg" aria-labelledby={`v-${entry.version}`}>
          <article className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[12px] font-medium">
                <span className="size-1.5 rounded-full bg-brand" /> v{entry.version}
              </span>
              <time dateTime={entry.date} className="mt-3 block text-[13.5px] text-muted-foreground">
                {dateFmt.format(new Date(entry.date))}
              </time>
            </div>
            <div className="max-w-3xl">
              <h2 id={`v-${entry.version}`} className="text-[30px] leading-tight font-semibold tracking-display sm:text-[38px]">
                {entry.title}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{entry.summary}</p>
              <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
                {entry.groups.map((g) => (
                  <section key={g.name} aria-label={g.name}>
                    <h3 className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider">
                      <PixelMark /> {g.name}
                    </h3>
                    <ul className="mt-4 space-y-2.5">
                      {g.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed">
                          <Check className="mt-1 size-3.5 shrink-0 text-(--brand-ink)" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </article>
        </Section>
      ))}
      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
