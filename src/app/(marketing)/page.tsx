import type { Metadata } from "next"
import Link from "next/link"
import { Check, KeyRound, Lock, X } from "lucide-react"
import { BentoCard } from "@/components/marketing/bento"
import { CtaSection } from "@/components/marketing/cta-section"
import { DotEnvelope } from "@/components/marketing/dot-envelope"
import { FaqSection } from "@/components/marketing/faq"
import { HeroInbox } from "@/components/marketing/hero-inbox"
import { getCloudPricing, type CloudPricing } from "@/components/marketing/lib/pricing"
import { PerSeatComparison, PlanCards } from "@/components/marketing/pricing-parts"
import {
  ArrowLink,
  ButtonLink,
  Eyebrow,
  GitHubMark,
  JsonLd,
  MonoLabel,
  Section,
  SectionHeading,
  StepLabel,
} from "@/components/marketing/primitives"
import { FeatureVisual } from "@/components/marketing/visuals"
import { WorksWith } from "@/components/marketing/works-with"
import { APP_ENTRY, GITHUB_URL } from "@/content/marketing/site"
import type { Faq } from "@/content/marketing/types"
import { getAppUrl } from "@/server/env"

export const metadata: Metadata = {
  title: { absolute: "Dispatch — The open-source collaborative inbox for teams" },
  description:
    "Shared inboxes, internal comments, assignments and automation on top of Gmail, Outlook or any IMAP mailbox. Open source and free to self-host, or hosted with unlimited users.",
  alternates: { canonical: "/" },
}

export default async function HomePage() {
  const pricing = await getCloudPricing()

  return (
    <>
      <Hero trialDays={pricing.trialDays} />
      <WorksWith />
      <Problem />
      <Collaborate />
      <Coordinate />
      <Automate />
      <RealtimeAi />
      <OpenSource />
      <PricingTeaser pricing={pricing} />
      <Comparison pricing={pricing} />
      <Section padding="lg">
        <FaqSection items={homeFaq(pricing)} />
      </Section>
      <CtaSection trialDays={pricing.trialDays} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Dispatch",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: getAppUrl(),
          license: "https://www.gnu.org/licenses/agpl-3.0.html",
          codeRepository: GITHUB_URL,
          description:
            "Open-source collaborative inbox: shared inboxes, internal comments, assignments and automation for Gmail, Outlook and IMAP.",
          offers: [
            { "@type": "Offer", name: "Self-hosted", price: "0", priceCurrency: pricing.currency },
            {
              "@type": "Offer",
              name: "Dispatch Cloud",
              price: String(pricing.amount),
              priceCurrency: pricing.currency,
            },
          ],
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

function Hero({ trialDays }: { trialDays: number }) {
  return (
    <Section padding="none" className="relative overflow-hidden" aria-labelledby="hero-title">
      <div aria-hidden className="mk-dots pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-60 mk-fade-bottom" />
      <div className="relative flex flex-col items-center pt-14 pb-12 text-center sm:pt-24 sm:pb-16">
        <Eyebrow href="/open-source">Open source · Self-host or cloud</Eyebrow>
        <h1
          id="hero-title"
          className="mt-7 max-w-4xl text-[40px] leading-[1.02] font-semibold tracking-display text-balance sm:text-[58px] lg:text-[66px]"
        >
          The inbox your whole team <span className="text-quiet">can work from.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground text-pretty sm:text-[17px]">
          Dispatch turns Gmail, Outlook and any IMAP mailbox into shared inboxes with internal comments, assignments
          and automation. Open source, and free to self-host.
        </p>
        <div className="mt-9 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <ButtonLink href={APP_ENTRY} size="lg" arrow>
            Start free trial
          </ButtonLink>
          <ButtonLink href="/self-hosting" size="lg" variant="secondary">
            <GitHubMark /> Self-host for free
          </ButtonLink>
        </div>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          {trialDays}-day free trial · Unlimited users · Cancel anytime
        </p>
      </div>
      <div
        className="relative pb-14 sm:pb-24"
        role="img"
        aria-label="The Dispatch inbox: a shared Support inbox, an open email from a customer, and an internal comment thread where Jonas @mentions Maya, who takes the conversation and replies."
      >
        <HeroInbox />
      </div>
    </Section>
  )
}

function Problem() {
  const pains = [
    {
      t: "“Did anyone reply?”",
      b: "Two people answer the same customer, or nobody does, because everyone assumed someone else would.",
    },
    {
      t: "FW: RE: FW: context",
      b: "Internal discussion happens in forwards and side chats the customer should never see, and nobody can find later.",
    },
    {
      t: "One shared password",
      b: "A single login for support@ means no record of who did what, and a security problem whenever someone leaves.",
    },
    {
      t: "Per-seat pricing",
      b: "Most team inbox tools bill per user, so part-timers, freelancers and managers get left out of the loop.",
    },
  ]
  const fixes = [
    "Every conversation has one owner",
    "Internal comments live next to the email",
    "Everyone signs in as themselves",
    "Unlimited users on every plan",
  ]
  return (
    <Section padding="lg" aria-labelledby="problem-title">
      <SectionHeading
        id="problem-title"
        eyebrow={<MonoLabel>The problem</MonoLabel>}
        title="Email wasn't built for teams."
        quiet="Your team works in it anyway."
      />
      <div className="mt-12 grid overflow-hidden rounded-[6px] border border-border sm:grid-cols-2 lg:grid-cols-4">
        {pains.map((p, i) => (
          <div
            key={p.t}
            className="border-b border-border p-6 last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:not(:last-child)]:border-r sm:[&:nth-child(n+3)]:border-b-0"
          >
            <div className="font-mono text-[11px] text-muted-foreground">0{i + 1}</div>
            <h3 className="mt-6 text-[16px] font-semibold tracking-tight">{p.t}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{p.b}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 rounded-[6px] border border-border bg-card p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8">
        <p className="text-[15px] font-semibold tracking-tight">
          With Dispatch <span className="text-muted-foreground">it just works:</span>
        </p>
        <ul className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
          {fixes.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-(--brand-ink)" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function PillarHeader({
  step,
  label,
  id,
  title,
  quiet,
  text,
  href,
}: {
  step: number
  label: string
  id: string
  title: string
  quiet: string
  text: string
  href: string
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-16">
      <SectionHeading id={id} eyebrow={<StepLabel step={step} label={label} />} title={title} quiet={quiet} />
      <div className="lg:pb-1">
        <p className="text-[15px] leading-relaxed text-muted-foreground">{text}</p>
        <ArrowLink href={href} className="mt-4">
          Explore {label.toLowerCase()} features
        </ArrowLink>
      </div>
    </div>
  )
}

function Collaborate() {
  return (
    <Section id="collaborate" padding="lg" aria-labelledby="collaborate-title">
      <PillarHeader
        step={1}
        label="Collaborate"
        id="collaborate-title"
        title="Talk about an email"
        quiet="right next to it."
        text="Comment, @mention and draft replies together inside the conversation. No more forwarding threads to ask a colleague, no more duplicate answers."
        href="/features#collaboration"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <BentoCard
          className="md:col-span-2 lg:col-span-4"
          layout="row"
          title="Internal comments & @mentions."
          quiet="Discuss any email with your team, invisible to the customer."
          visual="comments"
          href="/features/internal-comments"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Collaborative drafts."
          quiet="Write the tricky reply together, live."
          visual="drafts"
          href="/features/collaborative-drafts"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Presence & collision alerts."
          quiet="See who's viewing and who's already replying."
          visual="presence"
          href="/features/shared-inbox"
        />
        <BentoCard
          className="md:col-span-2 lg:col-span-4"
          layout="row"
          title="Team chat, built in."
          quiet="Channels and DMs, with emails one click away."
          visual="chat"
          href="/features/team-chat"
        />
      </div>
    </Section>
  )
}

function Coordinate() {
  return (
    <Section id="coordinate" padding="lg" aria-labelledby="coordinate-title">
      <PillarHeader
        step={2}
        label="Coordinate"
        id="coordinate-title"
        title="Every email has an owner."
        quiet="Nothing slips through."
        text="Assign conversations, sort them with labels, snooze what can wait and turn requests into tasks. Everyone knows what's theirs, and what's done."
        href="/features#workflow"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <BentoCard
          className="lg:col-span-2"
          title="Assignments."
          quiet="One owner per conversation, with everyone's workload in view."
          visual="assign"
          href="/features/assignments"
        />
        <BentoCard
          className="md:col-span-2 lg:col-span-4"
          layout="row"
          title="Labels & team inboxes."
          quiet="Sort by customer, topic or urgency and filter in a click."
          visual="labels"
          href="/features/labels"
        />
        <BentoCard
          className="md:col-span-2 lg:col-span-4"
          layout="row"
          title="Snooze, send later, undo send."
          quiet="Deal with email on your schedule, not the sender's."
          visual="snooze"
          href="/features/snooze-send-later"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Tasks."
          quiet="Standalone or linked to the email they came from."
          visual="tasks"
          href="/features/tasks"
        />
      </div>
    </Section>
  )
}

function Automate() {
  return (
    <Section id="automate" padding="lg" aria-labelledby="automate-title">
      <PillarHeader
        step={3}
        label="Automate"
        id="automate-title"
        title="Let the busywork"
        quiet="run itself."
        text="Rules route, label and assign new mail the moment it arrives. Canned responses, keyboard shortcuts and a full REST API take care of the rest."
        href="/features#workflow"
      />
      <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <BentoCard
          className="md:col-span-2 lg:col-span-4"
          layout="row"
          title="Rules & automation."
          quiet="When, if, then: label, assign, move or notify automatically."
          visual="rules"
          href="/features/rules-automation"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Canned responses."
          quiet="Type / and insert a reply with variables filled in."
          visual="canned"
          href="/features/canned-responses"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Analytics."
          quiet="Reply times, volume and workload per teammate."
          visual="analytics"
          href="/features/analytics"
        />
        <BentoCard
          className="lg:col-span-2"
          title="Keyboard first."
          quiet="Triage a busy inbox without touching the mouse."
          visual="shortcuts"
          href="/features"
        />
        <BentoCard
          className="md:col-span-2 lg:col-span-2"
          title="REST API & webhooks."
          quiet="Wire Dispatch into the tools you already use."
          visual="webhooks"
          href="/features/api-webhooks"
        />
      </div>
    </Section>
  )
}

function RealtimeAi() {
  const cards = [
    {
      k: "presence" as const,
      label: "Realtime",
      t: "Live for everyone.",
      q: "New mail, assignments, comments and drafts appear instantly on every screen.",
      href: "/features/collaborative-drafts",
    },
    {
      k: "ai" as const,
      label: "AI assistant",
      t: "AI with your own key.",
      q: "Summaries, drafts, tone and translation using your Anthropic or OpenAI key. Off until an admin turns it on.",
      href: "/features/ai-assistant",
    },
    {
      k: "mobile" as const,
      label: "Mobile",
      t: "In your pocket.",
      q: "Fully responsive and installable to your home screen. Triage on the train, reply from anywhere.",
      href: "/features/mobile",
    },
  ]
  return (
    <Section padding="lg" tone="surface" aria-labelledby="realtime-title">
      <SectionHeading
        id="realtime-title"
        eyebrow={<StepLabel label="Built for 2026" />}
        title="Realtime, AI-assisted,"
        quiet="and wherever you are."
        align="center"
      />
      <div className="mt-12 grid gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.k}
            href={c.href}
            className="group flex flex-col overflow-hidden rounded-[6px] border border-border bg-card transition-colors hover:border-foreground/20"
          >
            <div className="relative flex min-h-[300px] items-center justify-center border-b border-border bg-background p-6">
              <div aria-hidden className="mk-dots absolute inset-0 opacity-60 mk-fade-bottom" />
              <FeatureVisual kind={c.k} className="relative" />
            </div>
            <div className="p-6">
              <MonoLabel>{c.label}</MonoLabel>
              <h3 className="mt-3 text-[16px] leading-snug font-semibold tracking-tight">
                {c.t} <span className="font-medium text-muted-foreground">{c.q}</span>
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  )
}

function OpenSource() {
  const stats = [
    { v: "$0", l: "per seat", d: "No per-user pricing, on any plan." },
    { v: "100%", l: "your data", d: "Self-host and your mail never leaves your server." },
    { v: "∞", l: "users", d: "Invite the whole company, freelancers included." },
    { v: "5 min", l: "to deploy", d: "Docker Compose with a single DOMAIN variable." },
  ]
  const wizard = ["Create the admin account", "Set up email delivery (SMTP or SES)", "Name your first workspace", "Connect a mailbox"]
  return (
    <Section tone="dark" padding="lg" className="relative overflow-hidden" aria-labelledby="oss-title">
      <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <StepLabel label="Open source · AGPL-3.0" />
          <h2 id="oss-title" className="mt-5 text-[34px] leading-[1.04] font-semibold tracking-display text-balance sm:text-[48px]">
            Your inbox. Your server. <span className="text-quiet">Your data.</span>
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Dispatch is open source under the AGPL-3.0. Run it on any server with Docker Compose or Coolify: the only
            setting in your <code className="font-mono text-[0.9em] text-foreground">.env</code> is your domain,
            everything else is configured in the browser.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <ButtonLink href="/self-hosting" size="lg" arrow>
              Read the self-hosting guide
            </ButtonLink>
            <ButtonLink href={GITHUB_URL} external size="lg" variant="secondary">
              <GitHubMark /> View on GitHub
            </ButtonLink>
          </div>
        </div>
        <DotEnvelope className="mx-auto w-full max-w-[560px]" />
      </div>

      <div className="relative mt-16 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-[6px] border border-border bg-surface p-5 sm:p-6">
            <div className="text-[34px] leading-none font-semibold tracking-display sm:text-[42px]">{s.v}</div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-brand">{s.l}</div>
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-3 grid gap-3 lg:grid-cols-3">
        <BentoCard
          className="lg:col-span-2"
          layout="row"
          title="One variable to deploy."
          quiet="Point DOMAIN at your server, run docker compose up, open the setup wizard."
          visual="selfhost"
        />
        <BentoCard title="Configured in the browser." quiet="No config files to edit after the first start.">
          <ul className="mx-auto w-full max-w-[300px] space-y-2 text-[12.5px]">
            {wizard.map((w, i) => (
              <li key={w} className="flex items-center gap-2.5 rounded-[6px] border border-border bg-card px-3 py-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[10px] text-brand">
                  {i + 1}
                </span>
                {w}
              </li>
            ))}
          </ul>
        </BentoCard>
        <BentoCard title="Encrypted by default." quiet="Mailbox credentials and API keys are encrypted at rest.">
          <div className="mx-auto flex w-full max-w-[300px] flex-col gap-2 text-[12.5px]">
            {[
              [<Lock key="l" className="size-3.5" />, "AES-256-GCM for stored secrets"],
              [<KeyRound key="k" className="size-3.5" />, "Magic links, hashed & single-use"],
              [<X key="x" className="size-3.5" />, "Remote images blocked by default"],
            ].map(([icon, text]) => (
              <div key={String(text)} className="flex items-center gap-2.5 rounded-[6px] border border-border bg-card px-3 py-2.5">
                <span className="text-brand">{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </BentoCard>
        <BentoCard
          className="lg:col-span-2"
          layout="row"
          title="Many workspaces, one instance."
          quiet="Host every team or client in its own workspace, with a super-admin panel for the whole server."
          visual="security"
          href="/security"
        />
      </div>
    </Section>
  )
}

function PricingTeaser({ pricing }: { pricing: CloudPricing }) {
  return (
    <Section padding="lg" aria-labelledby="pricing-title">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-16">
        <SectionHeading
          id="pricing-title"
          eyebrow={<MonoLabel>Pricing</MonoLabel>}
          title="Two plans."
          quiet="No per-seat math."
        />
        <div className="lg:pb-1">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Both plans include every feature and unlimited users. Choose where it runs: on your server for free, or on
            ours for {pricing.perInterval} per workspace.
          </p>
          <ArrowLink href="/pricing" className="mt-4">
            See full pricing
          </ArrowLink>
        </div>
      </div>
      <div className="mt-12">
        <PlanCards pricing={pricing} compact />
      </div>
    </Section>
  )
}

function Comparison({ pricing }: { pricing: CloudPricing }) {
  return (
    <Section padding="lg" aria-labelledby="compare-title">
      <SectionHeading
        id="compare-title"
        eyebrow={<MonoLabel>Compare</MonoLabel>}
        title="Per-seat pricing adds up."
        quiet="Dispatch doesn't."
        description="Popular collaborative inbox tools charge for every person on the team. Dispatch charges per workspace, or nothing at all when you host it yourself."
      />
      <div className="mt-12">
        <PerSeatComparison pricing={pricing} />
      </div>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        <ArrowLink href="/compare/missive">Dispatch vs Missive</ArrowLink>
        <ArrowLink href="/compare/front">Dispatch vs Front</ArrowLink>
        <ArrowLink href="/compare/hiver">Dispatch vs Hiver</ArrowLink>
        <ArrowLink href="/compare">All comparisons</ArrowLink>
      </div>
    </Section>
  )
}

function homeFaq(p: CloudPricing): Faq[] {
  return [
    {
      q: "What is Dispatch?",
      a: "Dispatch is an open-source collaborative inbox. It connects to Gmail, Google Workspace, Outlook, Microsoft 365 or any IMAP/SMTP mailbox and adds what email is missing for teams: shared inboxes, internal comments, assignments, rules and a clear status for every conversation.",
    },
    {
      q: "Is it really free to self-host?",
      a: "Yes. Dispatch is licensed under the AGPL-3.0. You can run it on your own server with every feature and unlimited users at no cost; you only pay for your own hosting.",
    },
    {
      q: "How much does Dispatch Cloud cost?",
      a: `${p.price} per ${p.interval} per workspace, with unlimited users and every feature included. It starts with a ${p.trialDays}-day free trial and you can cancel anytime.`,
    },
    {
      q: "Do we have to move our email?",
      a: "No. Dispatch connects to your existing mailboxes and keeps them in sync. Your mail stays where it is; Dispatch adds the collaboration layer on top, so you can stop using it at any time without losing anything.",
    },
    {
      q: "Which email providers work with Dispatch?",
      a: "Gmail and Google Workspace, Outlook and Microsoft 365, and any provider that offers IMAP and SMTP, such as iCloud Mail, Fastmail or Zoho Mail.",
    },
    {
      q: "Does Dispatch send our email to an AI provider?",
      a: "Only if you turn the AI assistant on. It uses your own Anthropic or OpenAI API key, configured by an admin. Without a key, nothing is sent to any AI provider.",
    },
    {
      q: "Can we use it on our phones?",
      a: "Yes. Dispatch is fully responsive and can be installed to your home screen as an app, so the whole team can triage and reply on the go.",
    },
    {
      q: "How do people sign in?",
      a: "Without passwords. Dispatch sends a single-use magic link by email. Each device gets its own session, which stays signed in for up to a year and can be revoked at any time.",
    },
  ]
}
