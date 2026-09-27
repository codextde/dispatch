import type { Metadata } from "next"
import { AlertTriangle, ArrowUpRight, Cpu, Globe, HardDrive, Network } from "lucide-react"
import { CodeBlock } from "@/components/marketing/code-block"
import { CtaSection } from "@/components/marketing/cta-section"
import { getCloudPricing } from "@/components/marketing/lib/pricing"
import { PageHero } from "@/components/marketing/page-hero"
import { ButtonLink, GitHubMark, MonoLabel, PixelMark, Section } from "@/components/marketing/primitives"
import { VisualStage } from "@/components/marketing/visuals"
import { GITHUB_URL } from "@/content/marketing/site"

export const metadata: Metadata = {
  title: "Self-hosting guide",
  description:
    "Run Dispatch on your own server with Docker Compose or Coolify. The only setting is DOMAIN: set up email delivery, Gmail and Outlook, updates and backups in the browser.",
  alternates: { canonical: "/self-hosting" },
}

const docs = (file: string) => `${GITHUB_URL}/blob/main/docs/${file}`

const toc = [
  { id: "requirements", label: "Requirements" },
  { id: "quick-start", label: "Quick start" },
  { id: "coolify", label: "Deploy on Coolify" },
  { id: "setup", label: "First-run setup" },
  { id: "email", label: "Email delivery" },
  { id: "inboxes", label: "Gmail & Outlook" },
  { id: "updating", label: "Updating" },
  { id: "backups", label: "Backups" },
]

const quickStart = `mkdir -p /opt/dispatch && cd /opt/dispatch

# 1. Get the compose file and the Caddy override (automatic HTTPS)
curl -fsSLO https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/codextde/dispatch/main/docker-compose.override.example.yml -o docker-compose.override.yml

# 2. Set your domain (the only setting)
echo "DOMAIN=mail.example.com" > .env

# 3. Start
docker compose up -d`

const composeExcerpt = `services:
  app:
    image: ghcr.io/codextde/dispatch:\${DISPATCH_VERSION:-latest}
    restart: unless-stopped
    environment:
      DOMAIN: \${DOMAIN}          # the only setting
    volumes:
      - dispatch-data:/data
      - dispatch-secrets:/secrets:ro
    depends_on:
      db:
        condition: service_healthy

  worker:
    image: ghcr.io/codextde/dispatch:\${DISPATCH_VERSION:-latest}
    command: worker
    environment:
      DOMAIN: \${DOMAIN}

  db:
    image: postgres:17-alpine
    # password generated on first boot into the secrets volume`

const update = `cd /opt/dispatch
docker compose pull      # fetch the new images
docker compose up -d     # recreate app + worker; migrations run on start`

const backup = `mkdir -p backups
# Database (safe while Dispatch is running)
docker compose exec -T db pg_dump -U dispatch -d dispatch -Fc > "backups/dispatch-$(date +%F).dump"

# Data directory: master encryption key + local attachments
docker compose run --rm -T --no-deps --entrypoint tar app -C /data -czf - . > "backups/dispatch-data-$(date +%F).tar.gz"`

export default async function SelfHostingPage() {
  const pricing = await getCloudPricing()
  return (
    <>
      <PageHero
        eyebrow={<MonoLabel>Self-hosting guide</MonoLabel>}
        title="Run Dispatch on your server"
        quiet="in about five minutes."
        description="Three containers, one compose file and a single setting: your domain. Secrets are generated on first boot and everything else is configured in the browser."
        actions={
          <>
            <ButtonLink href="#quick-start" size="lg" arrow>
              Quick start
            </ButtonLink>
            <ButtonLink href={GITHUB_URL} external size="lg" variant="secondary">
              <GitHubMark /> View on GitHub
            </ButtonLink>
          </>
        }
        aside={<VisualStage kind="selfhost" size="lg" className="mk-glow bg-background" />}
      />

      <Section padding="none">
        <div className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[200px_1fr] lg:gap-16">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <MonoLabel>On this page</MonoLabel>
              <ol className="mt-4 space-y-2 border-l border-border">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="-ml-px block border-l border-transparent pl-4 text-[13.5px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ol>
              <a
                href={docs("self-hosting.md")}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
              >
                Full documentation <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </div>
          </nav>

          <div className="min-w-0 max-w-3xl space-y-20">
            <Block id="requirements" n={1} title="Requirements">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Cpu, t: "A small server", d: "1 vCPU and 1 GB RAM minimum; 2 vCPU and 2 GB+ recommended. amd64 or arm64." },
                  { icon: HardDrive, t: "Docker with Compose", d: "Docker Engine 24+ with the Compose plugin. 10 GB of disk plus room for attachments." },
                  { icon: Globe, t: "A domain", d: "A hostname such as mail.example.com with an A/AAAA record pointing to the server." },
                  { icon: Network, t: "Open ports", d: "80 and 443 inbound for HTTPS; outbound access to your providers' IMAP (993) and SMTP (465/587)." },
                ].map(({ icon: Icon, t, d }) => (
                  <div key={t} className="rounded-[6px] border border-border bg-card p-5">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{t}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>
            </Block>

            <Block
              id="quick-start"
              n={2}
              title="Quick start with Docker Compose"
              intro="The stack is three containers: the web app, a background worker that syncs mail, and PostgreSQL. The override file adds Caddy with automatic Let's Encrypt certificates; skip it if you already run a reverse proxy."
            >
              <CodeBlock code={quickStart} title="Terminal" />
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Then open <code className="font-mono text-[0.9em] text-foreground">https://mail.example.com/setup</code>.
                This is all the compose file needs. Note what&apos;s missing: no database password, no encryption key,
                no SMTP settings.
              </p>
              <CodeBlock code={composeExcerpt} title="docker-compose.yml (excerpt)" lang="yaml" />
            </Block>

            <Block
              id="coolify"
              n={3}
              title="Deploy on Coolify"
              intro="The same compose file works on Coolify as-is. Coolify runs the services, puts its proxy in front of the app and issues the certificate."
            >
              <Steps
                items={[
                  <>Point a DNS record such as <Code>mail.example.com</Code> at your Coolify server.</>,
                  <>
                    Create a resource from the public repository <Code>github.com/codextde/dispatch</Code> with the{" "}
                    <strong>Docker Compose</strong> build pack (or paste <Code>docker-compose.yml</Code>).
                  </>,
                  <>
                    Set the domain of the <Code>app</Code> service to <Code>https://mail.example.com:3000</Code>. The port
                    only tells the proxy where to route.
                  </>,
                  <>
                    Add the environment variable <Code>DOMAIN=mail.example.com</Code>. No passwords or secrets needed.
                  </>,
                  <>Deploy, wait for all three services to be healthy, then open <Code>/setup</Code>.</>,
                ]}
              />
              <DocLink href={docs("coolify.md")}>Coolify guide with screenshots and troubleshooting</DocLink>
            </Block>

            <Block
              id="setup"
              n={4}
              title="First-run setup"
              intro="The setup wizard at /setup runs once and turns the first account into the instance's super admin."
            >
              <Steps
                items={[
                  <>
                    <strong>Create the owner account.</strong> Your name and email. You sign in with magic links, so there
                    is no password to choose.
                  </>,
                  <>
                    <strong>System checks.</strong> Database connection, a writable data directory and an HTTPS public URL.
                  </>,
                  <>
                    <strong>Basic settings.</strong> Name the instance, choose private (invite-only) or SaaS mode, and
                    optionally set up email delivery.
                  </>,
                  <>
                    <strong>Create a workspace</strong>, connect an inbox and invite your team. Everything else lives in{" "}
                    <Code>/admin</Code> and the workspace settings.
                  </>,
                ]}
              />
              <Callout>
                Complete the wizard right after the first start. Until an owner exists, whoever opens{" "}
                <Code>/setup</Code> first can claim the instance.
              </Callout>
            </Block>

            <Block
              id="email"
              n={5}
              title="Email delivery: SMTP or Amazon SES"
              intro="Dispatch sends a few system emails itself: sign-in links, invitations and notifications. Replies to customers always go out through each inbox's own SMTP server."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { t: "Log", d: "The default. Emails are printed to the container logs, handy while you try things out." },
                  { t: "SMTP", d: "Any SMTP service: Postmark, Mailgun, Brevo, Resend, your own server or a Microsoft 365 mailbox." },
                  { t: "Amazon SES", d: "Cheap, reliable, high-volume delivery on AWS. Verify your domain, create SMTP credentials, done." },
                ].map((p) => (
                  <div key={p.t} className="rounded-[6px] border border-border bg-card p-5">
                    <h3 className="text-[15px] font-semibold tracking-tight">{p.t}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{p.d}</p>
                  </div>
                ))}
              </div>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Configure it in <strong className="text-foreground">Admin → Settings → Email</strong>, send a test email,
                and publish SPF, DKIM and DMARC records for the sender domain before inviting your team.
              </p>
              <DocLink href={docs("email-delivery.md")}>Email delivery guide</DocLink>
            </Block>

            <Block
              id="inboxes"
              n={6}
              title="Connecting Gmail, Outlook and IMAP"
              intro="Dispatch works on top of the mailboxes you already have. The worker syncs over IMAP and sends through the mailbox's own SMTP server, so sent mail lands in the mailbox's Sent folder as usual."
            >
              <div className="overflow-hidden rounded-[6px] border border-border bg-card">
                {[
                  { t: "Sign in with Google", d: "Gmail and Google Workspace, via an OAuth client you create once per instance in Google Cloud." },
                  { t: "Sign in with Microsoft", d: "Outlook.com and Microsoft 365, via an app registration in Microsoft Entra." },
                  { t: "IMAP / SMTP", d: "Everything else, with presets for iCloud, Fastmail, Zoho, IONOS, Yahoo and more. Usually with an app password." },
                ].map((m) => (
                  <div key={m.t} className="grid gap-1 border-b border-border p-5 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-6">
                    <h3 className="text-[14.5px] font-semibold tracking-tight">{m.t}</h3>
                    <p className="text-[13.5px] leading-relaxed text-muted-foreground">{m.d}</p>
                  </div>
                ))}
              </div>
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Credentials and tokens are tested before saving and stored encrypted with AES-256-GCM. OAuth apps are
                configured in <strong className="text-foreground">Admin → Settings → OAuth</strong>.
              </p>
              <DocLink href={docs("connecting-inboxes.md")}>Step-by-step Google and Microsoft setup</DocLink>
            </Block>

            <Block
              id="updating"
              n={7}
              title="Updating"
              intro="Pull the new images and restart. Database migrations run automatically and are guarded by a lock, so app and worker never run them twice."
            >
              <CodeBlock code={update} title="Terminal" />
              <p className="text-[14.5px] leading-relaxed text-muted-foreground">
                Prefer to control upgrades? Pin a release with <Code>DISPATCH_VERSION=1.0.0</Code> in your{" "}
                <Code>.env</Code>. Always read the release notes and take a backup first.
              </p>
              <DocLink href={docs("upgrading.md")}>Upgrading guide</DocLink>
            </Block>

            <Block
              id="backups"
              n={8}
              title="Backups"
              intro="Back up two things, together: the Postgres database and the data volume, which holds the master encryption key and locally stored attachments."
            >
              <CodeBlock code={backup} title="Terminal" />
              <Callout>
                A database backup is useless without <Code>/data/secrets/master.key</Code>: mailbox passwords and OAuth
                tokens are encrypted with it. Store it somewhere safe and separate from your dumps.
              </Callout>
              <DocLink href={docs("backup.md")}>Backup, automation and restore</DocLink>
            </Block>
          </div>
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

function Block({
  id,
  n,
  title,
  intro,
  children,
}: {
  id: string
  n: number
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <PixelMark /> {String(n).padStart(2, "0")}
      </span>
      <h2 id={`${id}-title`} className="mt-3 text-[26px] leading-tight font-semibold tracking-display sm:text-[30px]">
        {title}
      </h2>
      {intro && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{intro}</p>}
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 rounded-[6px] border border-border bg-card px-4 py-3.5 text-[14.5px] leading-relaxed">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-[10.5px] text-(--brand-ink)">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[4px] border border-border bg-surface px-1.5 py-px font-mono text-[0.86em] text-foreground">
      {children}
    </code>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[6px] border border-[#f59e0b]/35 bg-[#f59e0b]/[0.07] p-4 text-[14px] leading-relaxed">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#b45309]" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[13.5px] font-medium underline-offset-4 hover:underline"
    >
      {children} <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  )
}
