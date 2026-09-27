import type { Metadata } from "next"
import { CodeBlock } from "@/components/marketing/code-block"
import { CtaSection } from "@/components/marketing/cta-section"
import { IntegrationsHub, IntegrationTile } from "@/components/marketing/integrations"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, GitHubMark, MonoLabel, PixelMark, Section, StepLabel } from "@/components/marketing/primitives"
import { getIntegrationsByCategory, integrationCategories, integrations } from "@/content/marketing/integrations"
import { APP_ENTRY, docsUrl, GITHUB_DISCUSSIONS_URL } from "@/content/marketing/site"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Everything Dispatch connects to today: Gmail, Microsoft 365 and any IMAP mailbox, Amazon SES, Anthropic Claude and OpenAI, S3 storage, Stripe, and a REST API with signed webhooks.",
  alternates: { canonical: "/integrations" },
}

/** Shown around the Dispatch mark in the hero. */
const hubIds = ["gmail", "microsoft-365", "imap", "amazon-ses", "anthropic-claude", "webhooks-api", "aws-s3", "stripe"]

const webhookSample = `POST /hooks/dispatch HTTP/1.1
Content-Type: application/json
X-Dispatch-Event: conversation.assigned
X-Dispatch-Signature: t=1790530000,v1=5257a869e7ec…

{
  "id": "evt_4mJ1uQyX0pZk2cR8",
  "event": "conversation.assigned",
  "createdAt": "2026-09-27T14:05:00.000Z",
  "data": { "conversationId": "5f0c6b8e-…" }
}`

export default async function IntegrationsPage() {
  const pricing = await getCloudPricing()
  const categories = integrationCategories.map((c) => ({ ...c, items: getIntegrationsByCategory(c.slug) }))
  // Categories with one or two tiles share a band instead of leaving a mostly empty grid
  const wide = categories.filter((c) => c.items.length > 2)
  const compact = categories.filter((c) => c.items.length <= 2)

  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Integrations</MonoLabel>}
        title="Works with the tools"
        quiet="you already run."
        description="Dispatch sits on top of your existing mailboxes and plugs into the services around them: email delivery, AI, storage, billing and your own automations. Everything here works today."
        actions={
          <>
            <ButtonLink href={APP_ENTRY} size="lg" arrow>
              Start free trial
            </ButtonLink>
            <ButtonLink href="#build" size="lg" variant="secondary">
              Build your own
            </ButtonLink>
          </>
        }
        aside={<IntegrationsHub items={integrations.filter((i) => hubIds.includes(i.id))} />}
      >
        <nav aria-label="Integration categories" className="relative -mx-5 border-t border-border sm:-mx-8 lg:-mx-12">
          <ul className="scrollbar-none flex gap-1 overflow-x-auto px-5 py-3 sm:px-8 lg:px-12">
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <a
                  href={`#${c.slug}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3.5 text-[13px] font-medium text-foreground/80 transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {c.name}
                  <span className="font-mono text-[10.5px] text-muted-foreground">{c.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      {wide.map((cat) => (
        <Section key={cat.slug} id={cat.slug} padding="md" className="scroll-mt-16" aria-labelledby={`${cat.slug}-title`}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-end lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <PixelMark /> {String(categories.indexOf(cat) + 1).padStart(2, "0")}
              </span>
              <h2 id={`${cat.slug}-title`} className="mt-4 text-[28px] leading-tight font-semibold tracking-display sm:text-[32px]">
                {cat.name}
              </h2>
            </div>
            <p className="text-[14.5px] leading-relaxed text-muted-foreground lg:pb-1">{cat.description}</p>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cat.items.map((it) => (
              <li key={it.id}>
                <IntegrationTile integration={it} />
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {compact.length > 0 && (
        <Section padding="md">
          <div className={cn("grid gap-12 lg:gap-6", compact.length > 1 && "lg:grid-cols-[1fr_2fr]")}>
            {compact.map((cat) => (
              <section key={cat.slug} id={cat.slug} className="scroll-mt-24" aria-labelledby={`${cat.slug}-title`}>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <PixelMark /> {String(categories.indexOf(cat) + 1).padStart(2, "0")}
                </span>
                <h2 id={`${cat.slug}-title`} className="mt-4 text-[28px] leading-tight font-semibold tracking-display sm:text-[32px]">
                  {cat.name}
                </h2>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">{cat.description}</p>
                <ul className={cn("mt-8 grid gap-3", cat.items.length > 1 && "sm:grid-cols-2")}>
                  {cat.items.map((it) => (
                    <li key={it.id}>
                      <IntegrationTile integration={it} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Section>
      )}

      <Section id="build" tone="dark" padding="lg" className="relative scroll-mt-16 overflow-hidden" aria-labelledby="build-title">
        <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <StepLabel label="Build your own" />
            <h2 id="build-title" className="mt-5 text-[34px] leading-[1.04] font-semibold tracking-display text-balance sm:text-[46px]">
              Missing an integration? <span className="text-quiet">Build it in an afternoon.</span>
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              The web app runs on the same REST API you get. Create a workspace API key, subscribe to signed webhooks
              for ten events, and connect your CRM, your help center or a Zapier, Make or n8n workflow.
            </p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <ButtonLink href={docsUrl("api.md")} external size="lg" arrow>
                Read the API docs
              </ButtonLink>
              <ButtonLink href="/integrations/webhooks-api" size="lg" variant="secondary">
                Webhooks & API guide
              </ButtonLink>
            </div>
            <p className="mt-6 text-[13.5px] text-muted-foreground">
              Want a native integration instead?{" "}
              <a
                href={GITHUB_DISCUSSIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                <GitHubMark className="size-3.5" /> Suggest it on GitHub
              </a>
            </p>
          </div>
          <CodeBlock code={webhookSample} title="Webhook delivery" lang="http" className="min-w-0" />
        </div>
      </Section>

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
