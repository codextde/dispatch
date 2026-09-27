import type { Metadata } from "next"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, GitHubMark, MonoLabel, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { COMPANY, COMPANY_COUNTRY, GITHUB_DISCUSSIONS_URL, GITHUB_URL } from "@/content/marketing/site"
import { getSettings } from "@/server/settings"

export const metadata: Metadata = {
  title: "About",
  description:
    "Dispatch is building the best collaborative inbox for Gmail, Outlook and IMAP, as open source software. Made by Codext GmbH in Germany.",
  alternates: { canonical: "/about" },
}

const principles = [
  {
    t: "Open by default",
    d: "The whole product is open source under the AGPL-3.0: the inbox, the admin panel and the billing code. There is no closed \"enterprise edition\".",
  },
  {
    t: "Priced for teams, not seats",
    d: "Collaboration shouldn't get more expensive every time you add a colleague. Self-hosting is free and Dispatch Cloud is one flat price per workspace.",
  },
  {
    t: "Your data, your call",
    d: "Your mail stays in your mailboxes. Run Dispatch on your own server, in your own region, and turn integrations like AI on only if you want them.",
  },
  {
    t: "Calm, fast software",
    d: "Keyboard-first, realtime and quiet. An inbox your team spends hours in every day should feel like a good tool, not a dashboard.",
  },
]

export default async function AboutPage() {
  const [pricing, general] = await Promise.all([getCloudPricing(), getSettings("general").catch(() => null)])
  const supportEmail = general?.supportEmail?.trim()
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>About</MonoLabel>}
        title="We're building the collaborative inbox"
        quiet="we always wanted to use."
        description="Dispatch exists to be the best way for a team to work from shared email: on top of Gmail, Outlook or any IMAP mailbox, open source, and affordable for teams of any size."
      />

      <Section padding="lg" aria-labelledby="mission-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <SectionHeading id="mission-title" eyebrow={<StepLabel label="Our mission" />} title="Email is where work happens." quiet="It should work for teams." />
          <div className="space-y-5 text-[16px] leading-relaxed text-foreground/80">
            <p>
              Nearly every team shares an address: support@, sales@, hello@, invoices@. And nearly every team ends up
              with the same workarounds: a shared password, forwarded threads, a chat message asking &quot;did anyone
              reply to this?&quot;.
            </p>
            <p>
              Collaborative inboxes fix that, but the good ones are closed source and priced per seat, which means the
              people who only occasionally need access get left out, and your mail lives on someone else&apos;s servers.
            </p>
            <p>
              We think the best collaborative inbox should be open. So we built Dispatch: shared inboxes, internal
              comments, assignments, rules, chat, tasks and an AI assistant, released under the AGPL-3.0. Run it
              yourself for free, or let us run it for you for {pricing.perInterval} per workspace.
            </p>
          </div>
        </div>
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="principles-title">
        <SectionHeading id="principles-title" eyebrow={<MonoLabel>Principles</MonoLabel>} title="What we won't compromise on." />
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {principles.map((p, i) => (
            <div key={p.t} className="rounded-[6px] border border-border bg-card p-6 sm:p-7">
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{p.t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{p.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section padding="lg" aria-labelledby="who-title">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="who-title"
            eyebrow={<MonoLabel>Who we are</MonoLabel>}
            title={`Made by ${COMPANY}`}
            quiet={`in ${COMPANY_COUNTRY}.`}
            description={`Dispatch is built and maintained by ${COMPANY}, a software company from ${COMPANY_COUNTRY}, together with contributors from the open-source community. Dispatch Cloud, the hosted version, funds the development.`}
          />
          <div className="flex flex-col justify-center gap-3">
            <div className="rounded-[6px] border border-border bg-card p-6">
              <h3 className="text-[15px] font-semibold tracking-tight">Get in touch</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                Questions, ideas or feedback? Start a discussion on GitHub, where the whole community can chime in
                {supportEmail ? (
                  <>
                    , or email{" "}
                    <a href={`mailto:${supportEmail}`} className="text-foreground underline underline-offset-4">
                      {supportEmail}
                    </a>
                  </>
                ) : null}
                .
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <ButtonLink href={GITHUB_DISCUSSIONS_URL} external variant="secondary" arrow>
                  GitHub Discussions
                </ButtonLink>
                <ButtonLink href={GITHUB_URL} external variant="ghost">
                  <GitHubMark /> Source code
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
