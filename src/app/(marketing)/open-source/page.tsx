import type { Metadata } from "next"
import { Bug, Check, Circle, GitPullRequest, Languages, MessagesSquare, Scale } from "lucide-react"
import { CodeBlock } from "@/components/marketing/code-block"
import { CtaSection } from "@/components/marketing/cta-section"
import { DotEnvelope } from "@/components/marketing/dot-envelope"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, GitHubMark, MonoLabel, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { GITHUB_DISCUSSIONS_URL, GITHUB_ISSUES_URL, GITHUB_URL, LICENSE_URL } from "@/content/marketing/site"

export const metadata: Metadata = {
  title: "Open source",
  description:
    "Dispatch is open source under the AGPL-3.0. Why we chose the AGPL, how to contribute, and where the project is heading.",
  alternates: { canonical: "/open-source" },
}

const devSetup = `git clone https://github.com/codextde/dispatch.git && cd dispatch
corepack enable && pnpm install
pnpm services      # Postgres, Mailpit and a local IMAP/SMTP test server
pnpm db:migrate
pnpm dev           # http://localhost:3000, then create the first admin at /setup
pnpm dev:worker    # in a second terminal`

const roadmap: { t: string; done: boolean }[] = [
  { t: "Shared inboxes for Gmail, Microsoft 365 and IMAP", done: true },
  { t: "Comments, mentions, assignments, team chat and tasks", done: true },
  { t: "Rules, analytics, AI assistant, REST API and webhooks", done: true },
  { t: "Multi-workspace instances with custom roles and billing", done: true },
  { t: "SMS and WhatsApp channels", done: false },
  { t: "Native iOS and Android apps", done: false },
  { t: "Calendar integration (Google, Microsoft)", done: false },
  { t: "SAML SSO and SCIM provisioning", done: false },
  { t: "SLA policies and business hours", done: false },
  { t: "Importers for Missive and Front", done: false },
]

export default async function OpenSourcePage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Open source</MonoLabel>}
        title="Built in the open."
        quiet="Yours to run, read and improve."
        description="Every line of Dispatch is public under the GNU Affero General Public License v3.0: the inbox, the worker, the admin panel and the billing code."
        actions={
          <>
            <ButtonLink href={GITHUB_URL} external size="lg">
              <GitHubMark /> Star on GitHub
            </ButtonLink>
            <ButtonLink href="/self-hosting" size="lg" variant="secondary" arrow>
              Self-host Dispatch
            </ButtonLink>
          </>
        }
        aside={
          <div className="mk-dark overflow-hidden rounded-[10px] border border-border p-6 sm:p-10">
            <DotEnvelope className="mx-auto w-full max-w-[460px]" />
          </div>
        }
      />

      <Section padding="lg" aria-labelledby="why-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <SectionHeading
            id="why-title"
            eyebrow={<StepLabel label="Why AGPL-3.0" />}
            title="Free for everyone."
            quiet="And it stays that way."
            description="We picked the AGPL because it protects the thing that makes Dispatch worth using: that anyone can run it, and that improvements come back to the community."
          />
          <div className="grid gap-3">
            {[
              {
                t: "Use it for anything",
                d: "Run Dispatch for your company, commercially, on as many servers and with as many users as you like. No license keys, no user limits.",
              },
              {
                t: "Change whatever you need",
                d: "Fork it, adapt it, build integrations. If you only use your modified version internally, there's nothing else to do.",
              },
              {
                t: "Share improvements with your users",
                d: "If you let others use a modified Dispatch over a network, for example as a hosted service, you must offer them your changes under the same license. That keeps closed forks from taking without giving back.",
              },
            ].map((x) => (
              <div key={x.t} className="rounded-[6px] border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 text-[15.5px] font-semibold tracking-tight">
                  <Scale className="size-4 text-muted-foreground" aria-hidden /> {x.t}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{x.d}</p>
              </div>
            ))}
            <p className="text-[12.5px] text-muted-foreground">
              A plain-language summary, not legal advice. The{" "}
              <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                full license text
              </a>{" "}
              is what applies.
            </p>
          </div>
        </div>
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="contribute-title">
        <SectionHeading
          id="contribute-title"
          eyebrow={<MonoLabel>Contribute</MonoLabel>}
          title="There's a place for you"
          quiet="even if you don't write code."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Bug, t: "Report a bug", d: "Steps to reproduce help us fix it fast.", href: `${GITHUB_URL}/issues/new/choose`, cta: "Open an issue" },
            { icon: MessagesSquare, t: "Suggest a feature", d: "Start a discussion or upvote existing ideas.", href: GITHUB_DISCUSSIONS_URL, cta: "Join discussions" },
            { icon: GitPullRequest, t: "Write code", d: "Pick an issue labeled good first issue or help wanted.", href: `${GITHUB_ISSUES_URL}?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`, cta: "Find an issue" },
            { icon: Languages, t: "Improve the docs", d: "Everything in docs/ is plain Markdown. Small fixes welcome.", href: `${GITHUB_URL}/tree/main/docs`, cta: "Browse docs" },
          ].map(({ icon: Icon, t, d, href, cta }) => (
            <a
              key={t}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-[6px] border border-border bg-card p-5 transition-colors hover:border-foreground/20"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight">{t}</h3>
              <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">{d}</p>
              <span className="mt-4 text-[13px] font-medium group-hover:underline">{cta} ↗</span>
            </a>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <h3 className="text-[20px] font-semibold tracking-tight">Run it locally in a few commands</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
              You need Node.js, pnpm and Docker. The dev services include a mail catcher and a local IMAP/SMTP server,
              so you can test the whole flow without a real mailbox. Read{" "}
              <a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">
                CONTRIBUTING.md
              </a>{" "}
              before your first pull request.
            </p>
          </div>
          <CodeBlock code={devSetup} title="Terminal" />
        </div>
      </Section>

      <Section padding="lg" aria-labelledby="roadmap-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <SectionHeading
            id="roadmap-title"
            eyebrow={<MonoLabel>Roadmap</MonoLabel>}
            title="Where we're headed."
            quiet="Shaped in public."
            description="Priorities follow what the community asks for. Upvote feature requests or start a discussion to move something up the list."
          >
            <div className="mt-6">
              <ButtonLink href={GITHUB_DISCUSSIONS_URL} external variant="secondary" arrow>
                Discuss the roadmap
              </ButtonLink>
            </div>
          </SectionHeading>
          <ul className="overflow-hidden rounded-[6px] border border-border bg-card">
            {roadmap.map((r) => (
              <li key={r.t} className="flex items-center gap-3 border-b border-border px-5 py-3.5 text-[14.5px] last:border-b-0">
                {r.done ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-brand text-[#07210f]">
                    <Check className="size-2.5" strokeWidth={3} aria-hidden />
                  </span>
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className={r.done ? "" : "text-foreground/80"}>{r.t}</span>
                <span className="ml-auto font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  {r.done ? "Shipped" : "Planned"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
