import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { CodeBlock } from "@/components/marketing/code-block"
import { CtaSection } from "@/components/marketing/cta-section"
import { FaqSection } from "@/components/marketing/faq"
import { ConnectVisual, IntegrationMark, IntegrationTile } from "@/components/marketing/integrations"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ArrowLink, ButtonLink, MonoLabel, PixelMark, Section, SectionHeading } from "@/components/marketing/primitives"
import { VisualStage } from "@/components/marketing/visuals"
import { getFeature } from "@/content/marketing/features"
import { detailedIntegrations, getIntegration, integrationCategories } from "@/content/marketing/integrations"
import { APP_ENTRY, docsUrl } from "@/content/marketing/site"
import { MAIL_PRESETS } from "@/server/mail/credentials"

export function generateStaticParams() {
  return detailedIntegrations.map((i) => ({ slug: i.id }))
}

export async function generateMetadata({ params }: PageProps<"/integrations/[slug]">): Promise<Metadata> {
  const { slug } = await params
  const i = getIntegration(slug)
  if (!i) return {}
  return {
    title: `${i.name} integration`,
    description: i.detail.metaDescription,
    alternates: { canonical: `/integrations/${i.id}` },
  }
}

export default async function IntegrationPage({ params }: PageProps<"/integrations/[slug]">) {
  const { slug } = await params
  const integration = getIntegration(slug)
  if (!integration) notFound()
  const { detail } = integration
  const pricing = await getCloudPricing()
  const category = integrationCategories.find((c) => c.slug === integration.category)
  const related = detail.related.map((id) => getIntegration(id)).filter((i) => i !== undefined)
  const primaryDoc = detail.setup.docs[0]

  return (
    <>
      <PageHero
        breadcrumbs={[
          { label: "Integrations", href: "/integrations" },
          ...(category ? [{ label: category.name, href: `/integrations#${category.slug}` }] : []),
          { label: integration.name },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-3 pl-1 text-[12.5px] font-medium">
            <IntegrationMark mark={integration.mark} size="sm" className="size-5 rounded-full text-[9px] [&_svg]:size-3" />
            {integration.name}
          </span>
        }
        title={detail.headline[0]}
        quiet={detail.headline[1]}
        description={detail.description}
        actions={
          <>
            <ButtonLink href={APP_ENTRY} size="lg" arrow>
              Start free trial
            </ButtonLink>
            {primaryDoc && (
              <ButtonLink href={docsUrl(primaryDoc.file)} external size="lg" variant="secondary" arrow>
                Setup guide
              </ButtonLink>
            )}
          </>
        }
        aside={<ConnectVisual integration={integration} detail={detail} />}
      />

      <Section padding="lg" aria-labelledby="how-title">
        <SectionHeading
          id="how-title"
          eyebrow={<MonoLabel>How it works</MonoLabel>}
          title={`Connected in ${detail.steps.length} steps.`}
          quiet="Configured in the browser."
        />
        <ol className="mt-10 grid overflow-hidden rounded-[6px] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
          {detail.steps.map((s, i) => (
            <li
              key={s.title}
              className="border-b border-border p-6 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:[&:not(:last-child)]:border-r"
            >
              <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <PixelMark /> Step {i + 1}
              </span>
              <h3 className="mt-6 text-[16px] leading-snug font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section padding="lg" aria-labelledby="enables-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading id="enables-title" eyebrow={<MonoLabel>What it enables</MonoLabel>} title="More than a connection." size="sm" />
            <ul className="mt-8 grid gap-2">
              {detail.enables.map((e) => {
                const feature = e.feature ? getFeature(e.feature) : undefined
                const Icon = e.icon ?? feature?.icon ?? Check
                const body = (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface text-foreground/80">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-tight">
                        {e.title}
                        {feature && (
                          <ArrowRight
                            className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="mt-1 block text-[13.5px] leading-relaxed text-muted-foreground">{e.body}</span>
                    </span>
                  </>
                )
                return (
                  <li key={e.title}>
                    {feature ? (
                      <Link
                        href={`/features/${feature.slug}`}
                        className="group flex gap-3.5 rounded-[6px] border border-border bg-card p-4 transition-colors hover:border-foreground/20"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-3.5 rounded-[6px] border border-border bg-card p-4">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <VisualStage kind={detail.visual} size="lg" />
        </div>
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="setup-title">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <SectionHeading id="setup-title" eyebrow={<MonoLabel>Setup notes</MonoLabel>} title="Before you connect." size="sm" description={detail.setup.intro} />
            <ul className="mt-8 space-y-3">
              {detail.setup.docs.map((d) => (
                <li key={d.file}>
                  <ArrowLink href={docsUrl(d.file)} external>
                    {d.label}
                  </ArrowLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 space-y-5">
            {detail.setup.presets && <PresetTable />}
            <ul className="space-y-2">
              {detail.setup.notes.map((n) => (
                <li key={n} className="flex items-start gap-3 rounded-[6px] border border-border bg-card px-4 py-3 text-[14px] leading-relaxed">
                  <Check className="mt-1 size-4 shrink-0 text-(--brand-ink)" aria-hidden />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{n}</span>
                </li>
              ))}
            </ul>
            {detail.setup.snippet && (
              <CodeBlock code={detail.setup.snippet.code} title={detail.setup.snippet.title} lang={detail.setup.snippet.lang} />
            )}
          </div>
        </div>
      </Section>

      <Section padding="lg">
        <FaqSection items={detail.faq} />
      </Section>

      {related.length > 0 && (
        <Section padding="md" aria-labelledby="related-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="related-title" className="text-[20px] font-semibold tracking-tight">
              Related integrations
            </h2>
            <Link
              href="/integrations"
              className="group inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            >
              All integrations
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.id}>
                <IntegrationTile integration={r} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}

/** The presets of the "Connect inbox" form, read from the same source the form uses. */
function PresetTable() {
  const rows = Object.entries(MAIL_PRESETS).filter(([key]) => key !== "custom")
  const server = (s: { host: string; port: number; secure: boolean }) => `${s.host}:${s.port}`
  return (
    <div className="overflow-hidden rounded-[6px] border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <caption className="sr-only">IMAP and SMTP presets</caption>
          <thead className="border-b border-border bg-surface/60">
            <tr>
              {["Provider", "IMAP", "SMTP"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(([key, p]) => (
              <tr key={key}>
                <th scope="row" className="px-4 py-2.5 font-medium">
                  {p.label.replace(/ \(app password\)$/, "")}
                </th>
                <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted-foreground">
                  {server(p.imap)} <span className="text-foreground/60">{p.imap.secure ? "TLS" : "STARTTLS"}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted-foreground">
                  {server(p.smtp)} <span className="text-foreground/60">{p.smtp.secure ? "TLS" : "STARTTLS"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
        Anything else: choose Other (IMAP/SMTP) and enter the hosts yourself.
      </p>
    </div>
  )
}
