import type { Metadata } from "next"
import {
  Building2,
  Check,
  EyeOff,
  FileLock2,
  Fingerprint,
  Gauge,
  ImageOff,
  KeyRound,
  Layers,
  MonitorSmartphone,
  Network,
  ScrollText,
  ShieldCheck,
  Webhook,
} from "lucide-react"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, MonoLabel, Section, SectionHeading, StepLabel } from "@/components/marketing/primitives"
import { VisualStage } from "@/components/marketing/visuals"
import { GITHUB_SECURITY_URL, GITHUB_URL } from "@/content/marketing/site"

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Dispatch protects your mail: AES-256-GCM encrypted credentials, passwordless magic links, per-device sessions, role-based access, audit log, sandboxed email rendering and self-hosting for data sovereignty.",
  alternates: { canonical: "/security" },
}

const practices = [
  {
    icon: FileLock2,
    t: "Encrypted credentials",
    d: "Mailbox passwords, OAuth tokens and every stored secret are encrypted with AES-256-GCM, using keys derived from a master key that lives outside the database.",
  },
  {
    icon: Fingerprint,
    t: "Passwordless magic links",
    d: "No passwords to phish or reuse. Sign-in links and codes are single-use, expire after 15 minutes by default, are stored only as hashes and are rate-limited.",
  },
  {
    icon: MonitorSmartphone,
    t: "Sessions per device",
    d: "Sessions use 256-bit random tokens and only their SHA-256 hash is stored. Cookies are httpOnly, SameSite=Lax and Secure over HTTPS, and every user can see and revoke their devices.",
  },
  {
    icon: ShieldCheck,
    t: "Roles & custom permissions",
    d: "Owner, admin and member roles plus custom roles. Permissions are checked on the server for every page, action and API call, and inbox access is granted separately.",
  },
  {
    icon: ScrollText,
    t: "Audit log",
    d: "Security-relevant changes, from connected inboxes to role changes and revoked sessions, are recorded per workspace with who did what and when.",
  },
  {
    icon: EyeOff,
    t: "Sandboxed email rendering",
    d: "Email HTML is sanitized and rendered in a sandboxed iframe without script execution, so a malicious message can't run code in your session.",
  },
  {
    icon: ImageOff,
    t: "Remote image blocking",
    d: "Tracking pixels and remote images are blocked, asked for or allowed according to the instance policy you choose.",
  },
  {
    icon: Layers,
    t: "Strict browser policies",
    d: "A Content Security Policy, HSTS on HTTPS, frame-ancestors 'none', nosniff and a strict referrer policy on every response.",
  },
  {
    icon: Gauge,
    t: "Rate limiting",
    d: "Sign-in requests are limited per email address and per IP, and code attempts are capped, to stop brute-force and abuse.",
  },
  {
    icon: Building2,
    t: "Tenant isolation",
    d: "Every query is scoped to its workspace and conversation visibility goes through a single access layer. Realtime events carry IDs only.",
  },
  {
    icon: Network,
    t: "SSRF protection",
    d: "Recommended for shared instances: one setting refuses IMAP, SMTP and webhook hosts that resolve to private, loopback or link-local addresses.",
  },
  {
    icon: Webhook,
    t: "Signed webhooks",
    d: "Workspace webhooks carry an HMAC-SHA256 signature over a timestamp and the raw body, so receivers can verify each delivery came from your instance.",
  },
]

export default async function SecurityPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Security</MonoLabel>}
        title="Your mailboxes deserve"
        quiet="a serious threat model."
        description="A Dispatch instance has access to full mailboxes, so security isn't a feature we bolted on. Here's how the software protects your mail, and how self-hosting keeps it under your control."
        actions={
          <>
            <ButtonLink href={GITHUB_SECURITY_URL} external size="lg" arrow>
              Report a vulnerability
            </ButtonLink>
            <ButtonLink href={`${GITHUB_URL}/blob/main/docs/security.md`} external size="lg" variant="secondary">
              Security docs
            </ButtonLink>
          </>
        }
        aside={<VisualStage kind="security" size="lg" className="mk-glow bg-background" />}
      />

      <Section padding="lg" aria-labelledby="practices-title">
        <SectionHeading
          id="practices-title"
          eyebrow={<StepLabel label="Architecture & practices" />}
          title="Security,"
          quiet="all the way down."
        />
        <ul className="mt-12 grid overflow-hidden rounded-[6px] border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
          {practices.map(({ icon: Icon, t, d }) => (
            <li key={t} className="-mr-px -mb-px border-r border-b border-border p-6">
              <span className="flex size-9 items-center justify-center rounded-[6px] border border-border bg-surface">
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="dark" padding="lg" className="relative overflow-hidden" aria-labelledby="sovereignty-title">
        <div aria-hidden className="mk-dots pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative grid gap-12 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="sovereignty-title"
            eyebrow={<StepLabel label="Data sovereignty" />}
            title="Self-host it,"
            quiet="and your data never leaves your server."
            description="Run Dispatch in your own data center or with the cloud provider and region of your choice. That makes it far easier to meet GDPR and client confidentiality obligations, because you decide where mail is stored and who can reach it."
          />
          <ul className="space-y-3 self-center">
            {[
              "Mail stays in the original mailbox; Dispatch keeps a synced copy in your own Postgres",
              "No telemetry: Dispatch never reports usage data anywhere",
              "The AI assistant is off by default and only uses the provider and API key you configure",
              "Stripe is contacted only when an operator turns billing on",
              "Open source under AGPL-3.0, so every claim on this page can be verified in the code",
            ].map((s) => (
              <li key={s} className="flex items-start gap-3 rounded-[6px] border border-border bg-surface p-4 text-[14.5px]">
                <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section padding="lg" aria-labelledby="checklist-title">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading
            id="checklist-title"
            eyebrow={<MonoLabel>Operator checklist</MonoLabel>}
            title="Running your own instance?"
            quiet="Do these five things."
          />
          <ol className="space-y-2">
            {[
              ["Use HTTPS.", "Cookies are marked Secure only when your DOMAIN is served over https://. Coolify and the bundled Caddy handle certificates."],
              ["Complete the setup wizard right away.", "Until an owner exists, whoever opens /setup first can claim the instance."],
              ["Protect the master key.", "/data/secrets/master.key decrypts all stored credentials. Back it up separately from database dumps."],
              ["Block private networks on shared instances.", "Turn it on wherever people you don't fully trust can add inboxes or webhooks."],
              ["Keep Dispatch updated.", "Security fixes ship as patch releases and GitHub security advisories. Watch the repository."],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-4 rounded-[6px] border border-border bg-card p-5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[10.5px] text-(--brand-ink)">
                  {i + 1}
                </span>
                <span className="text-[14.5px] leading-relaxed">
                  <strong className="font-semibold">{t}</strong> <span className="text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section padding="lg" tone="surface" aria-labelledby="disclosure-title">
        <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
          <SectionHeading
            id="disclosure-title"
            eyebrow={
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-3.5 text-(--brand-ink)" aria-hidden />
                <MonoLabel>Responsible disclosure</MonoLabel>
              </span>
            }
            title="Found a vulnerability?"
            quiet="Tell us privately."
            description="Please don't open a public issue. Report it through GitHub's private vulnerability reporting: we acknowledge reports within three business days, coordinate the disclosure date with you and credit you in the advisory unless you'd rather stay anonymous."
          />
          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col lg:items-stretch">
            <ButtonLink href={GITHUB_SECURITY_URL} external size="lg" arrow>
              Report a vulnerability
            </ButtonLink>
            <ButtonLink href={`${GITHUB_URL}/blob/main/SECURITY.md`} external size="lg" variant="secondary">
              Read the security policy
            </ButtonLink>
          </div>
        </div>
      </Section>

      <CtaSection trialDays={pricing.trialDays} />
    </>
  )
}
