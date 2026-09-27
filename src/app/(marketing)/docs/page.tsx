import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, Bug, History, MessagesSquare, ShieldAlert } from "lucide-react"
import { CodeBlock } from "@/components/marketing/code-block"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ArrowLink, ButtonLink, GitHubMark, MonoLabel, PixelMark, Section, SectionHeading } from "@/components/marketing/primitives"
import { docGroups, docsQuickStart } from "@/content/marketing/docs"
import {
  docsUrl,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_SECURITY_URL,
  GITHUB_URL,
} from "@/content/marketing/site"

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Dispatch documentation: self-hosting with Docker Compose or Coolify, configuration, email delivery, connecting Gmail and Microsoft 365, billing, the REST API, architecture, security, upgrades and backups.",
  alternates: { canonical: "/docs" },
}

const help = [
  {
    icon: MessagesSquare,
    title: "Discussions",
    description: "Questions, ideas and show-and-tell with the community.",
    href: GITHUB_DISCUSSIONS_URL,
  },
  { icon: Bug, title: "Issues", description: "Found a bug? Open an issue with steps to reproduce.", href: GITHUB_ISSUES_URL },
  {
    icon: ShieldAlert,
    title: "Report a vulnerability",
    description: "Privately, through a GitHub security advisory. Never in a public issue.",
    href: GITHUB_SECURITY_URL,
  },
  { icon: History, title: "Changelog", description: "What changed in each release.", href: "/changelog" },
]

export default async function DocsPage() {
  const pricing = await getCloudPricing()
  const count = docGroups.reduce((n, g) => n + g.pages.length, 0)
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Documentation</MonoLabel>}
        title="Everything you need"
        quiet="to run and build on Dispatch."
        description={`${count} guides, from a five-minute install to the REST API. The docs live next to the code on GitHub, so they're versioned with every release.`}
        actions={
          <>
            <ButtonLink href="#quick-start" size="lg" arrow>
              Quick start
            </ButtonLink>
            <ButtonLink href={`${GITHUB_URL}/tree/main/docs`} external size="lg" variant="secondary">
              <GitHubMark /> Browse on GitHub
            </ButtonLink>
          </>
        }
        aside={
          <div id="quick-start" className="min-w-0 scroll-mt-24">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <PixelMark /> Quick start
              </span>
              <ArrowLink href="/self-hosting" className="text-[13px]">
                Full walkthrough
              </ArrowLink>
            </div>
            <CodeBlock code={docsQuickStart} title="Terminal · any server with Docker" className="mk-glow shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]" />
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Then open <code className="font-mono text-[0.92em] text-foreground">https://mail.example.com/setup</code> and
              enter the setup code. Everything else is configured in the browser.
            </p>
          </div>
        }
      />

      {docGroups.map((group, gi) => (
        <Section key={group.title} padding="md" aria-labelledby={`docs-${gi}-title`}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-end lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <PixelMark /> {String(gi + 1).padStart(2, "0")}
              </span>
              <h2 id={`docs-${gi}-title`} className="mt-4 text-[28px] leading-tight font-semibold tracking-display sm:text-[32px]">
                {group.title}
              </h2>
            </div>
            <p className="text-[14.5px] leading-relaxed text-muted-foreground lg:pb-1">{group.description}</p>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.pages.map((doc) => {
              const Icon = doc.icon
              return (
                <li key={doc.file}>
                  <article className="group relative flex h-full flex-col rounded-[6px] border border-border bg-card p-5 transition-colors hover:border-foreground/20">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-[7px] border border-border bg-surface text-foreground/80">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <ArrowUpRight
                        className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-foreground"
                        aria-hidden
                      />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold tracking-tight">
                      <a
                        href={docsUrl(doc.file)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
                      >
                        {doc.title}
                      </a>
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{doc.description}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-4">
                      <span className="font-mono text-[10.5px] text-muted-foreground">docs/{doc.file}</span>
                      {doc.related && (
                        <Link
                          href={doc.related.href}
                          className="relative z-10 inline-flex items-center gap-1 rounded-[4px] text-[12px] font-medium text-foreground/80 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          {doc.related.label}
                          <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        </Section>
      ))}

      <Section padding="lg" tone="surface" aria-labelledby="help-title">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <SectionHeading
            id="help-title"
            eyebrow={<MonoLabel>Get help</MonoLabel>}
            title="Stuck?"
            quiet="Ask the people who build it."
            description="Dispatch is developed in the open. Questions, bug reports and security reports all go through GitHub."
            size="sm"
          />
          <ul className="grid gap-2 sm:grid-cols-2">
            {help.map((h) => {
              const external = h.href.startsWith("http")
              const cls =
                "group flex h-full gap-3.5 rounded-[6px] border border-border bg-card p-4 transition-colors hover:border-foreground/20"
              const body = (
                <>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface">
                    <h.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[14.5px] font-semibold tracking-tight">
                      {h.title}
                      {external ? (
                        <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
                      ) : (
                        <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                      )}
                    </span>
                    <span className="mt-1 block text-[13.5px] leading-relaxed text-muted-foreground">{h.description}</span>
                  </span>
                </>
              )
              return (
                <li key={h.title}>
                  {external ? (
                    <a href={h.href} target="_blank" rel="noopener noreferrer" className={cls}>
                      {body}
                    </a>
                  ) : (
                    <Link href={h.href} className={cls}>
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </Section>

      <CtaSection
        title="Rather not run servers?"
        quiet="We'll host it for you."
        description={`Dispatch Cloud is the same software, managed for you: ${pricing.perInterval} per workspace with unlimited users, automatic updates and daily backups. Try it free for ${pricing.trialDays} days.`}
        trialDays={pricing.trialDays}
      />
    </>
  )
}
